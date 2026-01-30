FROM public.ecr.aws/x8v8d7g8/mars-base:latest
WORKDIR /app
COPY . .
ENV CI=true
RUN pnpm install
RUN pnpm add acorn
CMD ["/bin/bash"]