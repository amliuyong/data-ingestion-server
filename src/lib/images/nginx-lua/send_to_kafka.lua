-- https://github.com/doujiang24/lua-resty-kafka/

local producer = require("resty.kafka.producer")
local json = require("cjson")

local broker_list = {
  {host = "%%AWS_MSK_BROKER_1%%", port = 9092},
  {host = "%%AWS_MSK_BROKER_2%%", port = 9092},
  {host = "%%AWS_MSK_BROKER_3%%", port = 9092}
}

local log_json = {}

ngx.req.read_body()
log_json["data"] = ngx.req.get_body_data()

local topic = "%%AWS_MSK_TOPIC%%"
local topic_in_header = ngx.req.get_headers()["topic"]

if not (topic_in_header == nil or topic_in_header == '') then
  topic = topic_in_header
end 

local producer_error_handle = function(topic, partition_id, queue, index, err, retryable)
  ngx.log(ngx.ERR, "Error handle: index ", index, ' partition_id ', partition_id, ' retryable ', retryable, ' json ', json.encode(queue))
end

local bp = nil

local args = ngx.req.get_uri_args()
local sync = args["sync"]

if sync == "0" then
  bp = producer:new(broker_list, { producer_type = "async", flush_time = 3000, batch_num = 200, error_handle = producer_error_handle})
else
  bp = producer:new(broker_list)
end

local sendMsg = json.encode(log_json)

local ok, err = bp:send(topic, nil, sendMsg)
if not ok then
  ngx.say("send err:", err, ", topic:", topic, ", sync:", sync)
  return
end
