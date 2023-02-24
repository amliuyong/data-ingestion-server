#!/bin/sh

kill -USR1 `cat /run/nginx.pid 2>/dev/null` 2>/dev/null || true
