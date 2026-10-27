# OrderLine — Restaurant POS

A tablet ordering system any restaurant can adopt. The front counter takes orders from a picture menu, the kitchen tablet gets live tickets and print slips, and customers can order online. Every restaurant sets its own name, menu, prices, tax and pictures.

| Topping picker | Kitchen display |
| --- | --- |
| ![Picking pineapple and tandoori chicken from icon tiles](docs/toppings.png) | ![Kitchen tickets colour-coded by order type](docs/kitchen.png) |
| **Front counter** | **Customer online ordering** |
| ![Counter with picture menu and order ticket](docs/counter.png) | ![Online ordering page on a phone](docs/online-order.png) |

## Features

**Front counter tablet**
- Picture menu: every item and topping has an icon or a real photo, so staff find items at a glance instead of reading lists.
- Topping picker: a pizza with pineapple and tandoori chicken is two taps on the 🍍 and 🍗 tiles. Wings open a sauce picker the same way.
- Order type on every order: **Dine-in** (table number), **Take-out** (name), **Delivery** (name, phone, address).
- Order source: **In store** or **Phone call**. Website orders are marked **Online**.
- Kitchen notes per item ("well done", "no cheese").
- Payment: cash with change due, card, or gift card. Orders can also be sent to the kitchen first and paid later.

**Kitchen tablet**
- Live tickets in New → Cooking → Ready columns, synced instantly from all devices.
- Colour band per order type: blue dine-in, amber take-out, purple delivery.
- Topping icons, notes, paid/unpaid status, and a timer that turns red after 15 minutes.
- Sound alert and **auto print** for new orders, formatted for an 80 mm receipt printer.

**Online ordering** at `/order`: a customer page with pickup or delivery, cart and checkout.

**Orders & pay**: today's order count, paid sales, money still to collect, and payment for unpaid orders.

**Setup**: restaurant name, tagline, phone, tax %, currency and delivery fee; categories, menu items and toppings, each with an icon or an uploaded photo. A starter menu (pizza, wings and Indian dishes) is included so you can try everything right away.

## Run it

Needs [Node.js](https://nodejs.org) 18 or newer. There are no packages to install.

```bash
git clone https://github.com/SahnavazChoksi/restaurant-pos.git
cd restaurant-pos
npm start
```

Open http://localhost:3000.

| Screen | Address |
| --- | --- |
| Front counter | `http://<server>:3000/#counter` |
| Kitchen | `http://<server>:3000/#kitchen` |
| Orders & payments | `http://<server>:3000/#orders` |
| Setup | `http://<server>:3000/#setup` |
| Customer ordering page | `http://<server>:3000/order` |

## Set it up in a restaurant

1. Run the server on one computer in the restaurant (a small PC, laptop or Raspberry Pi).
2. Find its local IP address (for example `192.168.1.20`).
3. On the front tablet, open `http://192.168.1.20:3000/#counter` and add it to the home screen.
4. On the kitchen tablet, open `http://192.168.1.20:3000/#kitchen`, then turn on **Sound** and **Auto print slip**.
5. Open **Setup** and enter the restaurant's name, tax rate and menu.

### Kitchen printer

The kitchen tablet prints through the browser's normal print system to any 80 mm receipt printer the device can use. For printing with no dialog, run Chrome on the kitchen device in kiosk printing mode:

```bash
chrome --kiosk --kiosk-printing http://192.168.1.20:3000/#kitchen
```

Set the receipt printer as the system's default printer.

## How it works

```
public/index.html         The whole app (counter, kitchen, orders, online page, setup)
server.js                 Node.js server: static files, JSON API, live updates
seed/starter-menu.json    Starter menu loaded on first run
data/db.json              Your restaurant's data (created on first run, not committed)
```

- Data is stored in `data/db.json`. Back this file up to keep your menu and order history.
- Tablets receive changes instantly through Server-Sent Events (`/api/events`).
- The server hands out order numbers, so two tablets never create the same number. Numbers restart each day.
- If the page is opened without the server, it still works on that one device using browser storage.

### API

| Method | Route | Purpose |
| --- | --- | --- |
| GET | `/api/state` | Settings, menu and recent orders |
| GET | `/api/events` | Live update stream |
| PUT | `/api/config` | Save restaurant settings and categories |
| PUT | `/api/menu/:id` | Create or update a menu item or topping |
| DELETE | `/api/menu/:id` | Delete a menu item or topping |
| POST | `/api/orders` | Place an order |
| PATCH | `/api/orders/:id` | Update status or record payment |

Settings: `PORT` (default `3000`) and `DATA_DIR` (default `./data`).

## Before using it with real customers

- **Card payments** are recorded, not charged. Connect a payment provider such as Square, Stripe or Moneris to charge cards.
- **Staff login**: there is no password yet. Keep the server on the restaurant's private network, and only expose `/order` to the internet.
- **Hosting the online page** publicly needs HTTPS (for example behind a reverse proxy such as Caddy or Nginx).

## Roadmap ideas

- Staff PIN login and roles
- Card terminal integration
- Daily sales report export
- Item availability toggle ("sold out")
- Table map for dine-in
