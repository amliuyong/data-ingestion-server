ARG PLATFORM_ARG
#FROM --platform=$PLATFORM_ARG nginx:latest 
#FROM --platform=linux/arm64 nginx:latest
FROM --platform=linux/amd64 nginx:latest 

RUN apt-get update -y && apt-get upgrade -y && apt-get install cron logrotate unzip jq less -y

RUN curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
#RUN curl "https://awscli.amazonaws.com/awscli-exe-linux-aarch64.zip" -o "awscliv2.zip"

RUN unzip awscliv2.zip && ./aws/install

# default nginx path
ENV SERVER_ENDPOINT_PATH='/collect'

ENV AWS_S3_BUCKET='__NOT_SET__'
ENV AWS_S3_PREFIX='__NOT_SET__'
ENV USE_EFS='false'

COPY ./config/nginx.conf /etc/nginx/nginx.conf
COPY ./config/nginx-logrotate.conf  /etc/logrotate.d/nginx
COPY ./config/nginx-logrotate-crond.conf  /etc/cron.d/
COPY ./config/docker-entrypoint.sh /
COPY ./config/postrotate.sh /
COPY ./tools/* /tools/

USER root 

RUN chmod 0644 /etc/cron.d/nginx-logrotate-crond.conf /etc/logrotate.d/nginx
RUN chmod +x /postrotate.sh /tools/*  /docker-entrypoint.sh 

#RUN crontab /etc/cron.d/nginx-logrotate-crond.conf

EXPOSE 8088
