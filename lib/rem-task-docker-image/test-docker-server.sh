#!/bin/sh

docker run --rm -p 9000:8080 \
 --env AWS_REGION=ap-southeast-2 \
 --env AWS_ACCESS_KEY_ID \
 --env AWS_SECRET_ACCESS_KEY \
 --env AWS_SESSION_TOKEN \
 --env DATABASE_URL \
 rdsinit
