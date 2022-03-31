# NOTE: we specify amd64 to allow builds on Mac M1... the resulting Fargate only supports amd64
FROM amd64/openjdk:18-slim

RUN mkdir /rems
WORKDIR /rems

ENTRYPOINT ["./docker-entrypoint.sh"]

# https://github.com/team-carepay/carepool-aws-jdbc

# For documentation see docs/installing-upgrading.md
ADD https://github.com/CSCfi/rems/releases/download/v2.25/rems.jar /rems/rems.jar

COPY docker-entrypoint.sh /rems/docker-entrypoint.sh

COPY config.edn /rems/config.edn
COPY theme.edn /rems/theme.edn
COPY logback.xml /rems/logback.xml

RUN chmod 664 /usr/local/openjdk-18/lib/security/cacerts
