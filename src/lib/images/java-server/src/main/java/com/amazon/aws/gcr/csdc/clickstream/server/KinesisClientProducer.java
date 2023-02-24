package com.amazon.aws.gcr.csdc.clickstream.server;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import software.amazon.awssdk.core.SdkBytes;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.kinesis.KinesisAsyncClient;
import software.amazon.awssdk.services.kinesis.KinesisClient;
import software.amazon.awssdk.services.kinesis.model.PutRecordRequest;

import java.util.concurrent.ExecutionException;

public class KinesisClientProducer implements MessageProducer {

    private static final Logger LOGGER = LoggerFactory.getLogger(KinesisClientProducer.class);

    private final String streamName;

    private final String regionName;

    private KinesisAsyncClient kinesisAsyncClient;

    public KinesisClientProducer(String streamName, String regionName) {
        LOGGER.info("streamName: {}, regionName: {}", streamName, regionName);
        this.streamName = streamName;
        this.regionName = regionName;
        createKinesisClient();
    }

    private void createKinesisClient() {
        var region = Region.of(regionName);
        this.kinesisAsyncClient = KinesisAsyncClient.builder().region(region).build();
    }

    public void close() {
        this.kinesisAsyncClient.close();
    }

    private void send(Message m, boolean sync)  {
        byte[] bytes = Utils.toJsonAsBytes(m);
        if (bytes == null) {
            LOGGER.warn("Could not get JSON bytes for message");
            return;
        }
        PutRecordRequest putRecordRequest = PutRecordRequest.builder().streamName(this.streamName)
                .data(SdkBytes.fromByteArray(bytes)).partitionKey(m.getRid()).build();
        if (sync) {
            try {
                var putRecordResult = this.kinesisAsyncClient.putRecord(putRecordRequest).get();
                LOGGER.info("sent rid: {}, SeqNum: {}, ShardId: {}", m.getRid(), putRecordResult.sequenceNumber(), putRecordResult.shardId());
            } catch (Exception ex) {
                LOGGER.error("Error sending record to Amazon Kinesis.", ex);
                throw new RuntimeException(ex);
            }
        } else {
            LOGGER.info("sending rid: {}", m.getRid());
            this.kinesisAsyncClient.putRecord(putRecordRequest);
        }
    }

    @Override
    public void sendAsync(Message m) {
        this.send(m, false);
    }

    @Override
    public void sendSync(Message m) {
        this.send(m, true);
    }

    @Override
    public String getName() {
        return "kinesisProducer";
    }
}
