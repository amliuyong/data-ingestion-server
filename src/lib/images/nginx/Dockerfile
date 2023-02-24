ARG PLATFORM_ARG
FROM --platform=$PLATFORM_ARG public.ecr.aws/nginx/nginx:alpine
#FROM --platform=linux/arm64 nginx:latest
#FROM --platform=linux/amd64 nginx:latest 

# default nginx path
ENV SERVER_ENDPOINT_PATH='/collect'
ENV WORKER_CONNECTIONS='1024'

COPY ./config/nginx.conf /etc/nginx/nginx.conf
COPY ./config/docker-entrypoint.sh /

RUN chmod +x ./docker-entrypoint.sh

EXPOSE 8088
