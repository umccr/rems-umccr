# For documentation see docs/installing-upgrading.md

#FROM public.ecr.aws/lambda/java:11

FROM openjdk:18-slim

RUN mkdir /rems
WORKDIR /rems

ENTRYPOINT ["./docker-entrypoint.sh"]

ADD https://github.com/CSCfi/rems/releases/download/v2.25/rems.jar /rems/rems.jar

COPY docker-entrypoint.sh /rems/docker-entrypoint.sh

COPY umccr-config.edn /rems/config.edn
COPY umccr-theme.edn /rems/theme.edn
COPY logback.xml /rems/logback.xml

RUN chmod 664 /usr/local/openjdk-18/lib/security/cacerts
