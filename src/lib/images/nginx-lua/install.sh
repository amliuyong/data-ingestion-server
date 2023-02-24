#!/bin/sh
yum -y update
yum -y install readline-devel pcre-devel openssl-devel gcc wget tar gzip perl make unzip hostname
mkdir /opt/software
mkdir /opt/module
cd /opt/software/
wget https://openresty.org/download/openresty-1.9.7.4.tar.gz
tar -xzf openresty-1.9.7.4.tar.gz -C /opt/module/
cd /opt/module/openresty-1.9.7.4
./configure --prefix=/opt/openresty \
--with-luajit \
--without-http_redis2_module \
--with-http_iconv_module
make
make install
cd /opt/software/
wget https://github.com/doujiang24/lua-resty-kafka/archive/master.zip
unzip master.zip -d /opt/module/
cp -rf /opt/module/lua-resty-kafka-master/lib/resty/kafka/ /opt/openresty/lualib/resty/
mkdir /opt/openresty/nginx/lua/
mkdir /var/log/nginx/