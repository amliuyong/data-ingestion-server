#!/bin/bash
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
#
# Licensed under the Apache License, Version 2.0 (the "License").
# You may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#   http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

mvn
rc=$?
if [ $rc -gt 0 ];then
  exit 1
fi

LAMBDA_CODE=alb-receiver-lambda.zip

#set this for V2 AWS CLI to disable paging
#export AWS_PAGER=""

AWS_REGION=us-east-1
BUCKET=yongmzn-ue1
LAMBDA_STAGE_FOLDER=cs/lambda_code

aws s3 cp target/$LAMBDA_CODE s3://$BUCKET/$LAMBDA_STAGE_FOLDER/

FUNCTIONS=("test-lb")

for FUNCTION in ${FUNCTIONS[@]}; do
	echo update $FUNCTION
	aws lambda --region $AWS_REGION update-function-code --function-name $FUNCTION --s3-bucket $BUCKET --s3-key $LAMBDA_STAGE_FOLDER/$LAMBDA_CODE
done

curl  http://alb-to-lambda-271765114.us-east-1.elb.amazonaws.com/health
curl http://alb-to-lambda-271765114.us-east-1.elb.amazonaws.com/debug -d 'test data'
curl http://alb-to-lambda-271765114.us-east-1.elb.amazonaws.com/collect?sync=1 -d 'test data'
curl http://alb-to-lambda-271765114.us-east-1.elb.amazonaws.com/collect -d 'test data'
