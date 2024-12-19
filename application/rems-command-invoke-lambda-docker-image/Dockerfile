FROM --platform=linux/arm64/v8 public.ecr.aws/lambda/nodejs:20
WORKDIR ${LAMBDA_TASK_ROOT}

COPY package.json ./
RUN npm install --only=production
COPY index.mjs ./

CMD [ "index.handler" ]
