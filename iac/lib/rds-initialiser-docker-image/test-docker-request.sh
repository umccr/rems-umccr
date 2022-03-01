#!/bin/sh

curl -s -XPOST "http://localhost:9000/2015-03-31/functions/function/invocations" \
 -d '{"secretName":"arn:aws:secretsmanager:ap-southeast-2:843407916570:secret:RemsRdsPassword"}' | jq
