
 docker build -t test-server-spring .

 docker run -p 8088:8088 test-server-spring

 curl http://localhost:8088/debug -d 'test'
 curl http://localhost:8088/debug?sync=1 -d 'test'