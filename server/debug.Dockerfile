FROM golang:1.22-bullseye
WORKDIR /go/src/github.com/nikotubach/clang-tidy-configurator-v2
EXPOSE 8080 2345

RUN go install github.com/go-delve/delve/cmd/dlv@v1.8.1
ENV PATH="/go/src/github.com/nikotubach/clang-tidy-configurator-v2/third-party/clang-tidy:${PATH}"
COPY . .

CMD ["dlv", "debug", "./cmd/clang-tidy-configurator/", "--headless", \
    "--listen=:2345", "--api-version=2", "--log"]
