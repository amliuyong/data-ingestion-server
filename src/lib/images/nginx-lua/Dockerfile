#ARG BUILDPLATFORM=linux/amd64
#FROM --platform=linux/arm64 amazonlinux 
FROM --platform=linux/amd64 amazonlinux

ENV AWS_MSK_BROKERS='__NOT_SET__'
ENV AWS_MSK_TOPIC = '__NOT_SET__'

COPY install.sh /

RUN chmod +x /install.sh
RUN /install.sh
COPY nginx.conf /opt/openresty/nginx/conf/nginx.conf
COPY common.conf /opt/openresty/nginx/conf/conf.d/common.conf
COPY send_to_kafka.lua /opt/openresty/nginx/lua/send_to_kafka.lua
COPY nginx_entrypoint.sh /

RUN chmod +x /nginx_entrypoint.sh

EXPOSE 8080

#CMD /update_config.sh && /opt/openresty/nginx/sbin/nginx -c /opt/openresty/nginx/conf/nginx.conf
#ENTRYPOINT [ "/nginx_entrypoint.sh" ]
CMD /nginx_entrypoint.sh