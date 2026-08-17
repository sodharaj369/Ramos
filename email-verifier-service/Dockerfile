# ---- build stage ----
FROM golang:1.25-alpine AS build
WORKDIR /src

COPY go.mod go.sum ./
RUN go mod download

COPY main.go ./
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /out/email-verifier-service .

# ---- runtime stage ----
FROM alpine:3.20
RUN apk add --no-cache ca-certificates && adduser -D -u 10001 appuser
USER appuser
WORKDIR /app
COPY --from=build /out/email-verifier-service /app/email-verifier-service

ENV PORT=8080 \
    BIND_ALL=true \
    SMTP_TIMEOUT_SECONDS=8

EXPOSE 8080
ENTRYPOINT ["/app/email-verifier-service"]
