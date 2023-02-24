package com.amazon.aws.gcr.csdc.clickstream.server;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import javax.servlet.http.HttpServletRequest;
import java.util.*;

@SpringBootApplication
@RestController
public class JavaServerApplication {
    public static final String NOT_SET = "__NOT_SET__";
    public static final String AWS_REGION = System.getenv("AWS_REGION");
    public static final String AWS_KINESIS_STREAM_NAME = System.getenv("AWS_KINESIS_STREAM_NAME");
    public static final String AWS_MSK_BROKERS = System.getenv("AWS_MSK_BROKERS");
    public static final String AWS_MSK_TOPIC = System.getenv("AWS_MSK_TOPIC");

    public static final String SERVER_ENDPOINT_PATH = "/collect";
    public static final Map<String, String> CORS = Map.of("Access-Control-Allow-Origin", "*", "Access-Control-Allow-Credentials", "true", "Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    private static final Logger LOGGER = LoggerFactory.getLogger(JavaServerApplication.class);
    private static MskKafkaProducer kafkaProducer;

    private static KinesisClientProducer kinesisProducer;

    static {
        createKafkaProducer();
        createKinesisProducer();
    }

    private static void createKinesisProducer() {
        if (Utils.isNotBlank(AWS_KINESIS_STREAM_NAME) && !AWS_KINESIS_STREAM_NAME.equals(NOT_SET)) {
            try {
                kinesisProducer = new KinesisClientProducer(AWS_KINESIS_STREAM_NAME, AWS_REGION);
                Runtime.getRuntime().addShutdownHook(new Thread(() -> {
                    kinesisProducer.close();
                    LOGGER.info("shutdown {}", kinesisProducer.getName());
                }));
            } catch (Exception e) {
                LOGGER.error(Utils.getFullStackTrace(e));
            }
        }
    }

    private static void createKafkaProducer() {
        if (Utils.isNotBlank(AWS_MSK_BROKERS) && !AWS_MSK_BROKERS.equals(NOT_SET)) {
            try {
                kafkaProducer = new MskKafkaProducer(AWS_MSK_BROKERS, AWS_MSK_TOPIC);
                Runtime.getRuntime().addShutdownHook(new Thread(() -> {
                    kafkaProducer.flush();
                    kafkaProducer.close();
                    LOGGER.info("shutdown {}", kafkaProducer.getName());
                }));
            } catch (Exception e) {
                LOGGER.error(Utils.getFullStackTrace(e));
            }
        }
    }

    public static void main(String[] args) {
        SpringApplication.run(JavaServerApplication.class, args);
    }

    @GetMapping("/health")
    public String health() {
        return "{\"ok\": true}";
    }

    @PostMapping(SERVER_ENDPOINT_PATH)
    public ResponseEntity collectPost(
            @RequestParam(value = "sync", defaultValue = "0", required = false) String sync,
            @RequestParam(value = "appId", defaultValue = "", required = false) String appId,
            @RequestParam(value = "platform", defaultValue = "", required = false) String platform,
            @RequestParam(value = "compression", defaultValue = "", required = false) String compression,
            @RequestBody String body, HttpServletRequest request) {
        //LOGGER.info("body: {}", body);
        Message m = buildMessage(request, body, appId, platform, compression);
        try {
            return sendMessage(sync, m);
        } catch (Exception e) {
            LOGGER.error(Utils.getFullStackTrace(e));
            throw e;
        }
    }

    @GetMapping(SERVER_ENDPOINT_PATH)
    public ResponseEntity collectGet(
            @RequestParam(value = "sync", defaultValue = "0", required = false) String sync,
            @RequestParam(value = "appId", defaultValue = "", required = false) String appId,
            @RequestParam(value = "platform", defaultValue = "", required = false) String platform,
            @RequestParam(value = "compression", defaultValue = "", required = false) String compression,
            HttpServletRequest request) {
        Message m = this.buildMessage(request, null, appId, platform, compression);
        try {
            return sendMessage(sync, m);
        } catch (Exception e) {
            LOGGER.error(Utils.getFullStackTrace(e));
            throw e;
        }
    }

    private ResponseEntity sendMessage(String sync, Message m) {
        List<MessageProducer> producerList = getMessageProducers();
        for (MessageProducer producer : producerList) {
            if ("1".equals(sync) || "true".equals(sync)) {
                producer.sendSync(m);
            } else {
                producer.sendAsync(m);
            }
        }

        HttpHeaders headers = new HttpHeaders();
        for (Map.Entry<String, String> e : CORS.entrySet()) {
            headers.add(e.getKey(), e.getValue());
        }
        headers.add("rid", m.getRid());
        return new ResponseEntity<>(headers, HttpStatus.OK);
    }

    private List<MessageProducer> getMessageProducers() {
        List<MessageProducer> producerList = new ArrayList<>();
        if (kafkaProducer == null) {
            createKafkaProducer();
        }
        if (kinesisProducer == null) {
            createKinesisProducer();
        }

        if (kafkaProducer != null) {
            producerList.add(kafkaProducer);
        }
        if (kinesisProducer != null) {
            producerList.add(kinesisProducer);
        }

        if (producerList.size() == 0) {
            throw new RuntimeException("No producers");
        }
        return producerList;
    }

    private Message buildMessage(HttpServletRequest request, String body, String appId, String platform, String compression) {
        String queryString = request.getQueryString();
        String ip = request.getHeader("x-forwarded-for");
        String ua = request.getHeader("user-agent");
        String m = request.getMethod();
        String now = Utils.dateToString_ISO8601(new Date());
        String path = request.getServletPath();
        String rid = UUID.randomUUID().toString();
        String uri = path;
        if (Utils.isNotBlank(queryString)) {
            uri = uri + "?" + queryString;
        }
        Message message = new Message();
        message.setRid(rid);
        if (Utils.isNotBlank(body)) {
            message.setData(body);
        }
        message.setAppId(appId);
        message.setCompression(compression);
        message.setPlatform(platform);
        message.setDate(now);
        message.setIp(ip);
        message.setMethod(m);
        message.setPath(path);
        message.setUa(ua);
        message.setUri(uri);
        return message;
    }
}
