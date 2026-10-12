# API quick reference

Base URL: `http://localhost:5000/api`

## Auth
- `POST /auth/signup`
- `POST /auth/signin`
- `POST /auth/logout` (Bearer token)
- `GET /auth/me` (Bearer token)

## Products (Bearer token)
- `GET /products`
- `POST /products`
- `PATCH /products/:id`
- `PATCH /products/:id/publish`
- `DELETE /products/:id`

## Orders (Bearer token)
- `GET /orders`
- `PATCH /orders/:id/status`

## Admin (Bearer token)
- `GET /subscription`
- `GET /activity-logs` (Super Admin only)

## Public
- `GET /public/products/:organizationId`
- `GET /public/products/:organizationId/:productId`
- `POST /public/orders/:organizationId`

### Example public order body
```json
{
  "customerName": "Sample Customer",
  "customerEmail": "customer@example.com",
  "productId": 1,
  "quantity": 2,
  "deliveryAddress": "123 Example Street, City"
}
```
