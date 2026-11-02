# fastify-be-fintech

Fastify v5 core-banking / fintech API with PostgreSQL (Prisma 7), double-entry ledger, Redis rate-limit, Kafka domain events, JWT + API key, KYC (MinIO/S3), OpenTelemetry/Prometheus hooks, OpenAPI docs.

## Mid-tier infra map

| Layer | Local (laptop) | Server (k3s) |
| --- | --- | --- |
| Postgres | Compose `postgres` | `deploy/k3s/postgres.yaml` |
| MinIO | Compose `minio` | `deploy/k3s/minio.yaml` |
| Redis | Compose `redis` | `deploy/k3s/redis.yaml` |
| Kafka KRaft | Compose `kafka` | `deploy/k3s/kafka.yaml` |
| Obs (Prom/Grafana/Loki/Tempo/OTEL) | `docker compose --profile observability up -d` | Helm notes below |
| API | `npm run dev` | `deploy/k3s/api-deployment.yaml` |

Next-tier (not in this repo yet): HashiCorp Vault, multi-broker Kafka, full service mesh.

## Requirements

- Node.js >= 20
- PostgreSQL (Homebrew or Compose)
- Optional Docker: Redis, Kafka, observability stack
- Optional remote **k3s** server for cluster deploy

## Setup (laptop)

```bash
cp .env.example .env
npm install
# data plane (if Docker available)
docker compose up -d postgres minio redis kafka
# optional observability
docker compose --profile observability up -d
npx prisma migrate dev
npm run db:seed
npm run dev
```

- API: `http://localhost:3000`
- Swagger: `http://localhost:3000/docs`
- Metrics: `http://localhost:3000/metrics`
- Ready: `http://localhost:3000/ready`
- Grafana (obs profile): `http://localhost:3200` (admin/admin)
- Prometheus: `http://localhost:9090`
- Kafka UI: `http://localhost:8080`

Without Kafka brokers configured, money events fall back to **sync webhooks** in development/test.

### Demo credentials

| Email | Password | Role |
| --- | --- | --- |
| `admin@example.com` | `test1234!` | ADMIN |
| `customer@example.com` | `test1234!` | CUSTOMER |

Headers: `x-api-key`, `Authorization: Bearer <JWT>`, money POSTs need `Idempotency-Key`.

## Kafka topics

- `fintech.transfer.posted`
- `fintech.loan.disbursed`
- `fintech.loan.repaid`
- `fintech.fx.exchanged`
- `fintech.kyc.reviewed`

Producer runs in the API after DB commit + audit log. `src/workers/webhook-consumer.ts` consumes and delivers webhooks.

## Tests & quality

```bash
npm run lint
npx tsc -p tsconfig.json --noEmit
npm test
npm run build
```

Test layout: `tests/unit/*`, `tests/modules/*`.

CI workflow file: [`.github/workflows/ci.yml`](.github/workflows/ci.yml) (ready for GitHub later; not required to enable now).

## Setup k3s (server lokal — bukan laptop)

Prasyarat di **server** yang sudah ada k3s + `kubectl` context mengarah ke cluster itu.

### 1. Namespace + secrets

```bash
kubectl apply -f deploy/k3s/namespace.yaml
cp deploy/k3s/secret.example.yaml deploy/k3s/secret.yaml
# edit secret.yaml values, lalu:
kubectl apply -f deploy/k3s/secret.yaml
```

### 2. Data plane (urut)

```bash
kubectl apply -f deploy/k3s/postgres.yaml
kubectl apply -f deploy/k3s/redis.yaml
kubectl apply -f deploy/k3s/minio.yaml
kubectl apply -f deploy/k3s/kafka.yaml
kubectl -n fintech rollout status deploy/postgres
kubectl -n fintech rollout status deploy/redis
kubectl -n fintech rollout status deploy/kafka
```

### 3. Build & import API image ke k3s (tanpa registry)

Di server (path ke source repo):

```bash
docker build -t fintech-api:local .
docker save fintech-api:local -o /tmp/fintech-api.tar
sudo k3s ctr images import /tmp/fintech-api.tar
```

### 4. Deploy API + Ingress (Traefik bawaan k3s)

```bash
kubectl apply -f deploy/k3s/api-deployment.yaml
kubectl -n fintech rollout status deploy/fintech-api
kubectl -n fintech get ingress,svc,pods
```

Port-forward alternatif:

```bash
kubectl -n fintech port-forward svc/fintech-api 3000:80
curl -s localhost:3000/health
curl -s localhost:3000/ready
```

Jalankan migrasi sekali (job/manual) terhadap Postgres service, misalnya dari laptop dengan tunnel atau `kubectl run` + `prisma migrate deploy`.

### 5. Observability di k3s (Helm one-liners)

```bash
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm repo update
helm upgrade --install monitoring prometheus-community/kube-prometheus-stack -n monitoring --create-namespace
```

Tambahkan Tempo/Loki sesuai kebutuhan (Grafana Helm charts). Arahkan `OTEL_EXPORTER_OTLP_ENDPOINT` di Secret ke collector di cluster, set `OTEL_ENABLED=true`.

### 6. Troubleshooting singkat

- **CrashLoop API**: `kubectl -n fintech logs deploy/fintech-api` — biasanya Secret/DB URL salah.
- **PVC Pending**: pastikan k3s default storage class ada (`kubectl get sc`).
- **Kafka clients gagal**: cek `KAFKA_ADVERTISED_LISTENERS=PLAINTEXT://kafka:9092` (Service DNS in-cluster).
- **ImagePullBackOff**: image harus `IfNotPresent` + sudah di-import ke `k3s ctr`.

## Scripts

| Script | Description |
| --- | --- |
| `npm run dev` | Hot reload API + Kafka consumer |
| `npm test` | Vitest |
| `npm run build` | Compile |
| `npm run db:seed` | Seed chart + demo users |
