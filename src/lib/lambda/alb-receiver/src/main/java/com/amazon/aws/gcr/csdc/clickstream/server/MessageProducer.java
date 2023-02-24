package com.amazon.aws.gcr.csdc.clickstream.server;

public interface MessageProducer {
    void sendAsync(Message message);

    void sendSync(Message message);

    String getName();
}
