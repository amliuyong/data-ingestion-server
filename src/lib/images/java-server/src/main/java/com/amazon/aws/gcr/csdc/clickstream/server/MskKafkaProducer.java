package com.amazon.aws.gcr.csdc.clickstream.server;

import com.fasterxml.jackson.core.TreeNode;
import org.apache.kafka.clients.producer.KafkaProducer;
import org.apache.kafka.clients.producer.ProducerConfig;
import org.apache.kafka.clients.producer.ProducerRecord;
import org.apache.kafka.common.serialization.StringSerializer;
import org.apache.kafka.connect.json.JsonSerializer;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.Properties;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.atomic.LongAdder;

public class MskKafkaProducer implements MessageProducer {
    private static final Logger LOGGER = LoggerFactory.getLogger(MskKafkaProducer.class);
    private final KafkaProducer<String, TreeNode> producer;
    private final LongAdder counter = new LongAdder();
    private final String topic;

    public MskKafkaProducer(String brokerString, String topic) {
        LOGGER.info("brokerString: {}, topic: {}", brokerString, topic);
        Properties properties = new Properties();
        properties.setProperty(ProducerConfig.BOOTSTRAP_SERVERS_CONFIG, brokerString);
        properties.setProperty(ProducerConfig.KEY_SERIALIZER_CLASS_CONFIG, StringSerializer.class.getName());
        properties.setProperty(ProducerConfig.VALUE_SERIALIZER_CLASS_CONFIG, JsonSerializer.class.getName());
        properties.setProperty(ProducerConfig.ACKS_CONFIG, "1"); // 0, 1, all
        //properties.setProperty(ProducerConfig.ENABLE_IDEMPOTENCE_CONFIG, "true");

        properties.setProperty(ProducerConfig.RETRIES_CONFIG, Integer.toString(Integer.MAX_VALUE));

        // set high throughput producer configs
        properties.setProperty(ProducerConfig.LINGER_MS_CONFIG, "20");
        properties.setProperty(ProducerConfig.BATCH_SIZE_CONFIG, Integer.toString(32 * 1024));
        properties.setProperty(ProducerConfig.COMPRESSION_TYPE_CONFIG, "snappy");

        // create the Producer
        this.producer = new KafkaProducer<>(properties);
        this.topic = topic;
    }

    @Override
    public void sendAsync(Message message) {
        LOGGER.info("sendAsync: rid: {}", message.getRid());
        // create a producer record
        TreeNode jsonMessage = Utils.toJsonTree(message);
        ProducerRecord<String, TreeNode> producerRecord =
                new ProducerRecord<>(this.topic, null, jsonMessage);
        // send the data - asynchronous
        producer.send(producerRecord, (metadata, e) -> {
            if (e == null) {
                counter.add(1);
                // the record was successfully sent
                LOGGER.debug("Received new metadata. \n" +
                        "Topic: " + metadata.topic() + "\n" +
                        "Key: " + producerRecord.key() + "\n" +
                        "Partition: " + metadata.partition() + "\n" +
                        "Offset: " + metadata.offset() + "\n" +
                        "Timestamp: " + metadata.timestamp());
            } else {
                LOGGER.error("Error while producing sendAsync -", e);
            }
        });
        if (this.counter.longValue() % 1000 == 0) {
            this.flush();
            LOGGER.info("counter: {}", this.counter);
        }
    }

    @Override
    public void sendSync(Message message) {
        // create a producer record
        LOGGER.info("sendSync: rid: {}", message.getRid());
        TreeNode jsonMessage = Utils.toJsonTree(message);
        ProducerRecord<String, TreeNode> producerRecord =
                new ProducerRecord<>(this.topic, null, jsonMessage);
        // send the data - synchronous
        try {
            producer.send(producerRecord).get();
            counter.add(1);
        } catch (InterruptedException | ExecutionException e) {
            LOGGER.error("Error while producing sendSync -", e);
        }
        // flush
        flush();
    }

    public void flush() {
        producer.flush();
    }

    public void close() {
        // flush and close producer
        producer.close();
    }

    @Override
    public String getName() {
        return "kafkaProducer";
    }

    public long getCounter() {
        return this.counter.longValue();
    }
}

