---
name: shopping
description: Use for product discovery, price comparison, shipping and condition comparison, and cart preparation, with a hard boundary before any purchase, payment, or order submission.
---

# Shopping

1. Clarify the product identity, quantity, delivery location if relevant, budget, and the comparison criteria from the user's request.
2. Gather current offers through the browser runtime, and use connected apps when they provide structured order or receipt data.
3. Normalize currency, taxes, shipping, seller, stock, return terms, subscription terms, and the observation time before comparing.
4. Adding an item to a cart is a write action. Pause before it unless the user's instruction and the confirmation policy clearly permit it.
5. Checkout, purchase, payment, subscription, and order submission are external effects. Show the exact merchant, item, quantity, total, and delivery details, then request explicit confirmation immediately before submission.
6. Never request card details, account passwords, one-time codes, or session cookies in a conversation. Use the secure sign-in and payment surface supplied by the runtime or the merchant.
7. Report the comparison with direct product links, observed prices and conditions, the observation time, and any unavailable or unverified fields. Do not claim an order was placed without confirmation evidence.

A high-confidence Jev classification that a page is a purchase page is not permission to buy. Keep the confirmation step immediately before the submit action, not at the start of the task.
