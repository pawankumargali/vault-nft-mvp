# Price Keeper API Service

This service fetches and provides cryptocurrency prices.

## Setup

1.  Clone the repository (if you haven't already):
    ```bash
    # git clone <repo-url>
    cd price-service
    ```

2.  Copy the example environment file and update it with your database credentials:
    ```bash
    cp .env.example .env
    ```
    Edit `.env` and set your `DATABASE_URL`.

3.  Install dependencies:
    ```bash
    npm install
    ```

4.  Run database migrations:
    ```bash
    npm run migrate
    ```

## Running the service

To start the server (includes initial price fetch and cron job):
```bash
npm start
```

For development with auto-reloading:
```bash
npm run dev
```

## API Endpoint

`GET /api/v1/prices?symbols[]=WBTC&symbols[]=SUI`

### Example Request

```
GET /api/v1/prices?symbols[]=WBTC&symbols[]=SUI HTTP/1.1
Accept: application/json
```

### Example Successful 200 Response

```json
{
  "WBTC": {
    "price": "68012.345678901234",
    "publish_time": "2025-05-17T14:02:41.000Z"
  },
  "SUI": {
    "price": "1.1245",
    "publish_time": "2025-05-17T14:02:41.000Z"
  }
}
```
