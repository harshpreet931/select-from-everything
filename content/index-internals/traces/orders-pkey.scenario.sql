-- @title orders_pkey on shop: 10,000 int keys, a root over 28 leaves
-- @engine pglite
-- @db shop
-- @each

-- nbtree-pages reads this file: the primary key of orders exactly as the dataset builds it,
-- every page read with bt_page_items (four items kept per page, the real count in n).

-- @probe +btree(orders_pkey, items=4) "orders_pkey as shop builds it: the metapage says the root is page 3, one level above the leaves."
