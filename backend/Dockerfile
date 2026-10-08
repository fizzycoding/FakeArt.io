# Builds the FakeArt.io game server into a tiny image.
# Works on Render, Fly.io, Koyeb, Oracle Cloud (docker run) and anywhere else that runs containers.

FROM golang:1.26-alpine AS build
WORKDIR /src

# Download dependencies first so they are cached between builds.
COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/server .

# Final image: just the static binary, no shell, running as a non-root user.
FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=build /out/server /server

# The server listens on $PORT (hosting platforms set it); 8080 is the fallback.
ENV PORT=8080
EXPOSE 8080
ENTRYPOINT ["/server"]
