package com.amazon.aws.gcr.csdc.clickstream.server;

import com.amazonaws.services.lambda.runtime.Context;
import com.amazonaws.services.lambda.runtime.RequestHandler;
import com.amazonaws.services.lambda.runtime.events.ApplicationLoadBalancerRequestEvent;
import com.amazonaws.services.lambda.runtime.events.ApplicationLoadBalancerResponseEvent;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.nio.charset.StandardCharsets;
import java.util.*;

public class ALBReceiverLambda implements RequestHandler<ApplicationLoadBalancerRequestEvent, ApplicationLoadBalancerResponseEvent> {
    public static final String NOT_SET = "__NOT_SET__";
    public static final String AWS_REGION = System.getenv("AWS_REGION");
    public static final String AWS_KINESIS_STREAM_NAME = System.getenv("AWS_KINESIS_STREAM_NAME");
    public static final String AWS_MSK_BROKERS = System.getenv("AWS_MSK_BROKERS");
    public static final String AWS_MSK_TOPIC = System.getenv("AWS_MSK_TOPIC");
    public static final Map<String, String> CORS = Map.of(
            "Content-Type", "text/plain",
            "Access-Control-Allow-Origin", "*",
            "Access-Control-Allow-Credentials",
            "true", "Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    private static final Logger LOGGER = LoggerFactory.getLogger(ALBReceiverLambda.class);
    private static final List<MessageProducer> producers = new ArrayList<>();

    static {
        if (!NOT_SET.equals(AWS_MSK_BROKERS)) {
            MskKafkaProducer producer = new MskKafkaProducer(AWS_MSK_BROKERS, AWS_MSK_TOPIC);
            producers.add(producer);
            Runtime.getRuntime().addShutdownHook(new Thread(() -> {
                producer.flush();
                producer.close();
                LOGGER.info("Shutdown {}", producer.getName());
            }));
            LOGGER.info("add producer {}", producer.getName());
        }
        if (!NOT_SET.equals(AWS_KINESIS_STREAM_NAME)) {
            KinesisClientProducer producer = new KinesisClientProducer(AWS_KINESIS_STREAM_NAME, AWS_REGION);
            producers.add(producer);
            Runtime.getRuntime().addShutdownHook(new Thread(()->{
                producer.close();
                LOGGER.info("Shutdown {}", producer.getName());
            }));
            LOGGER.info("add producer {}", producer.getName());
        }
    }

    @Override
    public ApplicationLoadBalancerResponseEvent handleRequest(ApplicationLoadBalancerRequestEvent input, Context context) {
        try {
            return processRequest(input, context);
        } catch (Exception e) {
            LOGGER.error(Utils.getFullStackTrace(e));
            ApplicationLoadBalancerResponseEvent response = new ApplicationLoadBalancerResponseEvent();
            response.setHeaders(CORS);
            response.setStatusCode(500);
            return response;
        }
    }

    private ApplicationLoadBalancerResponseEvent processRequest(ApplicationLoadBalancerRequestEvent input, Context context) {
        ApplicationLoadBalancerResponseEvent response = new ApplicationLoadBalancerResponseEvent();
        Map<String, String> headers = new HashMap<>(CORS);
        response.setStatusCode(200);
        response.setHeaders(headers);

        String path = input.getPath();
        if (path.equals("/health")) {
            response.setBody("{\"ok\": true}");
            return response;
        }

        Map<String, String> query = input.getQueryStringParameters();
        Message message = buildMessage(input, context, path, query);
        if (path.equals("/debug")) {
            response.setBody(Utils.toJson(message));
        } else {
            boolean sync = query.getOrDefault("sync", "").equals("true") || query.getOrDefault("sync", "").equals("1");
            sendMessage(message, sync);
        }
        headers.put("rid", message.getRid());
        return response;
    }

    private void sendMessage(Message message, boolean sync) {
        if (producers.size() == 0) {
            throw new RuntimeException("No producers");
        }
        for (MessageProducer producer : producers) {
            if (sync) {
                producer.sendSync(message);
            } else {
                producer.sendAsync(message);
            }
        }
    }


    private Message buildMessage(ApplicationLoadBalancerRequestEvent input, Context context, String path, Map<String, String> query) {
        String method = input.getHttpMethod();
        String ip = input.getHeaders().get("x-forwarded-for");
        String ua = input.getHeaders().get("user-agent");
        String body = input.getBody();
        boolean isBase64Encoded = input.getIsBase64Encoded();
        if (isBase64Encoded && Utils.isNotBlank(body)) {
            body = decodeBody(body);
        }
        String rid = context.getAwsRequestId();
        String uri = getUri(path, query);
        Message message = new Message();
        String appId = query.getOrDefault("appId", "");
        String compression = query.getOrDefault("compression", "");
        String platform = query.getOrDefault("platform", "");
        message.setAppId(appId);
        message.setCompression(compression);
        message.setPlatform(platform);
        message.setRid(rid);
        message.setData(body);
        message.setDate(Utils.dateToString_ISO8601(new Date()));
        message.setIp(ip);
        message.setMethod(method);
        message.setPath(path);
        message.setUa(ua);
        message.setUri(uri);
        LOGGER.info("uri: {}", uri);
        return message;
    }

    private String decodeBody(String body) {
        Base64.Decoder dec = Base64.getDecoder();
        body = new String(dec.decode(body), StandardCharsets.UTF_8);
        return body;
    }

    private String getUri(String path, Map<String, String> query) {
        StringBuilder sb = new StringBuilder();
        sb.append(path);
        if (query.size() > 0) {
            sb.append("?");
            for (Map.Entry<String, String> e : query.entrySet()) {
                String key = e.getKey();
                String val = e.getValue();
                sb.append(key).append("=").append(val).append("&");
            }
            sb.deleteCharAt(sb.length() - 1);
        }
        return sb.toString();
    }
}
