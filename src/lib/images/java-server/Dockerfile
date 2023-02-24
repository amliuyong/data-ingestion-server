FROM maven:3.6 AS build

WORKDIR /app
COPY pom.xml .
RUN mvn -B -f pom.xml -s /usr/share/maven/ref/settings-docker.xml dependency:resolve
COPY . .
RUN mvn -B -s /usr/share/maven/ref/settings-docker.xml package -DskipTests


FROM openjdk:11
WORKDIR /app
ENV AWS_MSK_BROKERS='__NOT_SET__'
ENV AWS_MSK_TOPIC='__NOT_SET__'
ENV AWS_KINESIS_STREAM_NAME='__NOT_SET__'
ENV AWS_REGION='__NOT_SET__'

COPY --from=build /app/target/java-server-0.0.1-SNAPSHOT.jar .
EXPOSE 8088

ENV JAVA_OPTS="-server -Xms1536m -Xmx1536m -Xss256k"
CMD ["java", "-Dserver.port=8088", "-jar","/app/java-server-0.0.1-SNAPSHOT.jar","com.amazon.aws.gcr.csdc.clickstream.server.JavaServerApplication"]
