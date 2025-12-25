-- SQL upserts generated from instance/csvs
-- Run this file in your Postgres provider console or via psql on a machine that can connect

INSERT INTO brand (name, description) VALUES ('Creed', 'A legacy of over 250 years, crafting original fragrances for royal houses and discerning tastes.')
  ON CONFLICT (name) DO UPDATE SET description = EXCLUDED.description;
INSERT INTO brand (name, description) VALUES ('Clive Christian', 'British luxury perfume house.')
  ON CONFLICT (name) DO UPDATE SET description = EXCLUDED.description;
INSERT INTO brand (name, description) VALUES ('Amouage', 'Iconic Omani fragrance house.')
  ON CONFLICT (name) DO UPDATE SET description = EXCLUDED.description;
INSERT INTO brand (name, description) VALUES ('Tom Ford', NULL)
  ON CONFLICT (name) DO UPDATE SET description = EXCLUDED.description;
INSERT INTO brand (name, description) VALUES ('Penhaligon''s', NULL)
  ON CONFLICT (name) DO UPDATE SET description = EXCLUDED.description;
INSERT INTO brand (name, description) VALUES ('Xerjoff', NULL)
  ON CONFLICT (name) DO UPDATE SET description = EXCLUDED.description;
INSERT INTO brand (name, description) VALUES ('Emporio Armani', NULL)
  ON CONFLICT (name) DO UPDATE SET description = EXCLUDED.description;

INSERT INTO product (id, brand, title, price, description, "keyNotes", image_url, thumbnails, status, quantity, tags) VALUES ('PRD001', 'Creed', 'Aventus', 350.0, 'The iconic, best-selling men''s fragrance by Creed. A sophisticated blend for the discerning individual, celebrating strength and success.', 'Top: Pineapple, Blackcurrant, Bergamot, Heart: Moroccan Jasmine, Birch, Patchouli, Base: Musk, Oakmoss, Ambergris', '/static/images/creed/creed.jpg', '/static/images/creed/creed_aventus0.jpg,/static/images/creed/creed_aventus1.jpg,/static/images/creed/creed_aventus2.jpg', 'restocked', 10, 'gym,active,masculine,fruity,sport')
  ON CONFLICT (id) DO UPDATE SET
    brand = EXCLUDED.brand,
    title = EXCLUDED.title,
    price = EXCLUDED.price,
    description = EXCLUDED.description,
    "keyNotes" = EXCLUDED."keyNotes",
    image_url = EXCLUDED.image_url,
    thumbnails = EXCLUDED.thumbnails,
    status = EXCLUDED.status,
    quantity = EXCLUDED.quantity,
    tags = EXCLUDED.tags;
INSERT INTO product (id, brand, title, price, description, "keyNotes", image_url, thumbnails, status, quantity, tags) VALUES ('PRD002', 'Creed', 'Himalaya', 280.0, 'Inspired by the rugged beauty and serenity of the Tibetan mountains.', 'Top: Bergamot, Grapefruit, Lemon;Heart: Sandalwood, Juniper Berries;Base: Musk, Ambergris, Cedarwood', 'images/creed/himalaya.jpg', 'images/creed/himalaya.jpg,images/creed/himalaya_side.jpg,images/creed/himalaya_box.jpg', 'restocked', 10, 'active,fresh,sport,mountain,outdoor')
  ON CONFLICT (id) DO UPDATE SET
    brand = EXCLUDED.brand,
    title = EXCLUDED.title,
    price = EXCLUDED.price,
    description = EXCLUDED.description,
    "keyNotes" = EXCLUDED."keyNotes",
    image_url = EXCLUDED.image_url,
    thumbnails = EXCLUDED.thumbnails,
    status = EXCLUDED.status,
    quantity = EXCLUDED.quantity,
    tags = EXCLUDED.tags;
INSERT INTO product (id, brand, title, price, description, "keyNotes", image_url, thumbnails, status, quantity, tags) VALUES ('PRD003', 'Creed', 'Aventus for Her', 330.0, 'The feminine counterpart to the legendary Aventus.', 'Top: Green Apple, Violet, Pink Peppercorn;Heart: Rose, Styrax, Sandalwood;Base: Peach, Amber, Ylang-Ylang', 'images/creed/aventus_for_her.jpg', 'images/creed/aventus_for_her.jpg,images/creed/aventus_for_her_side.jpg,images/creed/aventus_for_her_box.jpg', 'restocked', 10, 'fruity,feminine,confident')
  ON CONFLICT (id) DO UPDATE SET
    brand = EXCLUDED.brand,
    title = EXCLUDED.title,
    price = EXCLUDED.price,
    description = EXCLUDED.description,
    "keyNotes" = EXCLUDED."keyNotes",
    image_url = EXCLUDED.image_url,
    thumbnails = EXCLUDED.thumbnails,
    status = EXCLUDED.status,
    quantity = EXCLUDED.quantity,
    tags = EXCLUDED.tags;
INSERT INTO product (id, brand, title, price, description, "keyNotes", image_url, thumbnails, status, quantity, tags) VALUES ('PRD617764', 'Creed', 'Absolu Aventus', 50.0, NULL, NULL, 'absolu_aventus.jpg', 'absolu_aventus.jpg', 'new-arrivals', 10, NULL)
  ON CONFLICT (id) DO UPDATE SET
    brand = EXCLUDED.brand,
    title = EXCLUDED.title,
    price = EXCLUDED.price,
    description = EXCLUDED.description,
    "keyNotes" = EXCLUDED."keyNotes",
    image_url = EXCLUDED.image_url,
    thumbnails = EXCLUDED.thumbnails,
    status = EXCLUDED.status,
    quantity = EXCLUDED.quantity,
    tags = EXCLUDED.tags;
INSERT INTO product (id, brand, title, price, description, "keyNotes", image_url, thumbnails, status, quantity, tags) VALUES ('PRD618402', 'Creed', 'Green Irish Tweed', 50.0, NULL, NULL, 'green_irish_tweed.jpg', 'green_irish_tweed.jpg', 'new-arrivals', 10, NULL)
  ON CONFLICT (id) DO UPDATE SET
    brand = EXCLUDED.brand,
    title = EXCLUDED.title,
    price = EXCLUDED.price,
    description = EXCLUDED.description,
    "keyNotes" = EXCLUDED."keyNotes",
    image_url = EXCLUDED.image_url,
    thumbnails = EXCLUDED.thumbnails,
    status = EXCLUDED.status,
    quantity = EXCLUDED.quantity,
    tags = EXCLUDED.tags;
INSERT INTO product (id, brand, title, price, description, "keyNotes", image_url, thumbnails, status, quantity, tags) VALUES ('PRD619258', 'Creed', 'Aventus Cologne', 50.0, NULL, NULL, '/static/aventus_cologne.jpg', 'aventus_cologne.jpg', 'restocked', 10, NULL)
  ON CONFLICT (id) DO UPDATE SET
    brand = EXCLUDED.brand,
    title = EXCLUDED.title,
    price = EXCLUDED.price,
    description = EXCLUDED.description,
    "keyNotes" = EXCLUDED."keyNotes",
    image_url = EXCLUDED.image_url,
    thumbnails = EXCLUDED.thumbnails,
    status = EXCLUDED.status,
    quantity = EXCLUDED.quantity,
    tags = EXCLUDED.tags;
INSERT INTO product (id, brand, title, price, description, "keyNotes", image_url, thumbnails, status, quantity, tags) VALUES ('PRD619702', 'Creed', 'Royal Oud', 50.0, NULL, NULL, '/static/royal_oud.jpg', 'royal_oud.jpg', 'restocked', 10, NULL)
  ON CONFLICT (id) DO UPDATE SET
    brand = EXCLUDED.brand,
    title = EXCLUDED.title,
    price = EXCLUDED.price,
    description = EXCLUDED.description,
    "keyNotes" = EXCLUDED."keyNotes",
    image_url = EXCLUDED.image_url,
    thumbnails = EXCLUDED.thumbnails,
    status = EXCLUDED.status,
    quantity = EXCLUDED.quantity,
    tags = EXCLUDED.tags;
INSERT INTO product (id, brand, title, price, description, "keyNotes", image_url, thumbnails, status, quantity, tags) VALUES ('PRD620101', 'Creed', 'Virgin Island Water', 50.0, NULL, NULL, 'virgin_island_water.jpg', 'virgin_island_water.jpg', 'restocked', 10, NULL)
  ON CONFLICT (id) DO UPDATE SET
    brand = EXCLUDED.brand,
    title = EXCLUDED.title,
    price = EXCLUDED.price,
    description = EXCLUDED.description,
    "keyNotes" = EXCLUDED."keyNotes",
    image_url = EXCLUDED.image_url,
    thumbnails = EXCLUDED.thumbnails,
    status = EXCLUDED.status,
    quantity = EXCLUDED.quantity,
    tags = EXCLUDED.tags;
INSERT INTO product (id, brand, title, price, description, "keyNotes", image_url, thumbnails, status, quantity, tags) VALUES ('PRD621083', 'Creed', 'Silver Mountain Water', 50.0, NULL, NULL, '/static/silver_mountain_water.jpg', 'silver_mountain_water.jpg', 'restocked', 10, NULL)
  ON CONFLICT (id) DO UPDATE SET
    brand = EXCLUDED.brand,
    title = EXCLUDED.title,
    price = EXCLUDED.price,
    description = EXCLUDED.description,
    "keyNotes" = EXCLUDED."keyNotes",
    image_url = EXCLUDED.image_url,
    thumbnails = EXCLUDED.thumbnails,
    status = EXCLUDED.status,
    quantity = EXCLUDED.quantity,
    tags = EXCLUDED.tags;
INSERT INTO product (id, brand, title, price, description, "keyNotes", image_url, thumbnails, status, quantity, tags) VALUES ('PRD621511', 'Creed', 'Millésime Impérial', 10.0, NULL, NULL, '/static/millésime_impérial.jpg', 'millésime_impérial.jpg', 'restocked', 10, NULL)
  ON CONFLICT (id) DO UPDATE SET
    brand = EXCLUDED.brand,
    title = EXCLUDED.title,
    price = EXCLUDED.price,
    description = EXCLUDED.description,
    "keyNotes" = EXCLUDED."keyNotes",
    image_url = EXCLUDED.image_url,
    thumbnails = EXCLUDED.thumbnails,
    status = EXCLUDED.status,
    quantity = EXCLUDED.quantity,
    tags = EXCLUDED.tags;
INSERT INTO product (id, brand, title, price, description, "keyNotes", image_url, thumbnails, status, quantity, tags) VALUES ('PRD622628', 'Creed', 'Fragaria', 10.0, NULL, NULL, 'fragaria.jpg', 'fragaria.jpg', 'restocked', 10, NULL)
  ON CONFLICT (id) DO UPDATE SET
    brand = EXCLUDED.brand,
    title = EXCLUDED.title,
    price = EXCLUDED.price,
    description = EXCLUDED.description,
    "keyNotes" = EXCLUDED."keyNotes",
    image_url = EXCLUDED.image_url,
    thumbnails = EXCLUDED.thumbnails,
    status = EXCLUDED.status,
    quantity = EXCLUDED.quantity,
    tags = EXCLUDED.tags;
INSERT INTO product (id, brand, title, price, description, "keyNotes", image_url, thumbnails, status, quantity, tags) VALUES ('PRD623290', 'Creed', 'Original Santal', 10.0, NULL, NULL, 'original_santal.jpg', 'original_santal.jpg', 'restocked', 10, NULL)
  ON CONFLICT (id) DO UPDATE SET
    brand = EXCLUDED.brand,
    title = EXCLUDED.title,
    price = EXCLUDED.price,
    description = EXCLUDED.description,
    "keyNotes" = EXCLUDED."keyNotes",
    image_url = EXCLUDED.image_url,
    thumbnails = EXCLUDED.thumbnails,
    status = EXCLUDED.status,
    quantity = EXCLUDED.quantity,
    tags = EXCLUDED.tags;
INSERT INTO product (id, brand, title, price, description, "keyNotes", image_url, thumbnails, status, quantity, tags) VALUES ('PRD623749', 'Creed', 'Millésime 1849', 10.0, NULL, NULL, 'millésime_1849.jpg', 'millésime_1849.jpg', 'restocked', 10, NULL)
  ON CONFLICT (id) DO UPDATE SET
    brand = EXCLUDED.brand,
    title = EXCLUDED.title,
    price = EXCLUDED.price,
    description = EXCLUDED.description,
    "keyNotes" = EXCLUDED."keyNotes",
    image_url = EXCLUDED.image_url,
    thumbnails = EXCLUDED.thumbnails,
    status = EXCLUDED.status,
    quantity = EXCLUDED.quantity,
    tags = EXCLUDED.tags;
INSERT INTO product (id, brand, title, price, description, "keyNotes", image_url, thumbnails, status, quantity, tags) VALUES ('PRD624167', 'Creed', 'Fleurs de Bulgarie', 10.0, NULL, NULL, 'Fleurs_de_Bulgarie.jpg', 'Fleurs_de_Bulgarie.jpg', 'restocked', 10, NULL)
  ON CONFLICT (id) DO UPDATE SET
    brand = EXCLUDED.brand,
    title = EXCLUDED.title,
    price = EXCLUDED.price,
    description = EXCLUDED.description,
    "keyNotes" = EXCLUDED."keyNotes",
    image_url = EXCLUDED.image_url,
    thumbnails = EXCLUDED.thumbnails,
    status = EXCLUDED.status,
    quantity = EXCLUDED.quantity,
    tags = EXCLUDED.tags;
INSERT INTO product (id, brand, title, price, description, "keyNotes", image_url, thumbnails, status, quantity, tags) VALUES ('PRD624550', 'Creed', 'Viking', 10.0, NULL, NULL, 'viking.jpg', 'viking.jpg', 'restocked', 10, NULL)
  ON CONFLICT (id) DO UPDATE SET
    brand = EXCLUDED.brand,
    title = EXCLUDED.title,
    price = EXCLUDED.price,
    description = EXCLUDED.description,
    "keyNotes" = EXCLUDED."keyNotes",
    image_url = EXCLUDED.image_url,
    thumbnails = EXCLUDED.thumbnails,
    status = EXCLUDED.status,
    quantity = EXCLUDED.quantity,
    tags = EXCLUDED.tags;
INSERT INTO product (id, brand, title, price, description, "keyNotes", image_url, thumbnails, status, quantity, tags) VALUES ('PRD625019', 'Creed', 'Spring Flower', 10.0, NULL, NULL, 'spring_flower.jpg', 'spring_flower.jpg', 'restocked', 10, NULL)
  ON CONFLICT (id) DO UPDATE SET
    brand = EXCLUDED.brand,
    title = EXCLUDED.title,
    price = EXCLUDED.price,
    description = EXCLUDED.description,
    "keyNotes" = EXCLUDED."keyNotes",
    image_url = EXCLUDED.image_url,
    thumbnails = EXCLUDED.thumbnails,
    status = EXCLUDED.status,
    quantity = EXCLUDED.quantity,
    tags = EXCLUDED.tags;
INSERT INTO product (id, brand, title, price, description, "keyNotes", image_url, thumbnails, status, quantity, tags) VALUES ('PRD737949', 'Amouage', 'Guidance 46', 12.0, NULL, NULL, 'guidance_46.jpg', 'guidance_46.jpg', 'restocked', 10, NULL)
  ON CONFLICT (id) DO UPDATE SET
    brand = EXCLUDED.brand,
    title = EXCLUDED.title,
    price = EXCLUDED.price,
    description = EXCLUDED.description,
    "keyNotes" = EXCLUDED."keyNotes",
    image_url = EXCLUDED.image_url,
    thumbnails = EXCLUDED.thumbnails,
    status = EXCLUDED.status,
    quantity = EXCLUDED.quantity,
    tags = EXCLUDED.tags;
INSERT INTO product (id, brand, title, price, description, "keyNotes", image_url, thumbnails, status, quantity, tags) VALUES ('PRD738746', 'Amouage', 'G', 12.0, 'Amouage Guidance Eau de Parfum', NULL, 'g.jpg', 'g.jpg', 'restocked', 10, NULL)
  ON CONFLICT (id) DO UPDATE SET
    brand = EXCLUDED.brand,
    title = EXCLUDED.title,
    price = EXCLUDED.price,
    description = EXCLUDED.description,
    "keyNotes" = EXCLUDED."keyNotes",
    image_url = EXCLUDED.image_url,
    thumbnails = EXCLUDED.thumbnails,
    status = EXCLUDED.status,
    quantity = EXCLUDED.quantity,
    tags = EXCLUDED.tags;
INSERT INTO product (id, brand, title, price, description, "keyNotes", image_url, thumbnails, status, quantity, tags) VALUES ('PRD739359', 'Amouage', 'Silver Oud', 12.0, 'Amouage Opus XIII Silver Oud Eau de Parfum', NULL, 'silver_oud.jpg', 'silver_oud.jpg', 'restocked', 10, NULL)
  ON CONFLICT (id) DO UPDATE SET
    brand = EXCLUDED.brand,
    title = EXCLUDED.title,
    price = EXCLUDED.price,
    description = EXCLUDED.description,
    "keyNotes" = EXCLUDED."keyNotes",
    image_url = EXCLUDED.image_url,
    thumbnails = EXCLUDED.thumbnails,
    status = EXCLUDED.status,
    quantity = EXCLUDED.quantity,
    tags = EXCLUDED.tags;
INSERT INTO product (id, brand, title, price, description, "keyNotes", image_url, thumbnails, status, quantity, tags) VALUES ('PRD740229', 'Amouage', 'Rose Incenso', 12.0, 'Amouage Opus XII Rose Incense Eau de Parfum', NULL, '/static/rose_incenso.jpg', 'rose_incenso.jpg', 'restocked', 10, NULL)
  ON CONFLICT (id) DO UPDATE SET
    brand = EXCLUDED.brand,
    title = EXCLUDED.title,
    price = EXCLUDED.price,
    description = EXCLUDED.description,
    "keyNotes" = EXCLUDED."keyNotes",
    image_url = EXCLUDED.image_url,
    thumbnails = EXCLUDED.thumbnails,
    status = EXCLUDED.status,
    quantity = EXCLUDED.quantity,
    tags = EXCLUDED.tags;
INSERT INTO product (id, brand, title, price, description, "keyNotes", image_url, thumbnails, status, quantity, tags) VALUES ('PRD741021', 'Amouage', 'Outland', 13.0, 'Amouage Outlands Eau de Parfum', NULL, 'outland.jpg', 'outland.jpg', 'restocked', 10, NULL)
  ON CONFLICT (id) DO UPDATE SET
    brand = EXCLUDED.brand,
    title = EXCLUDED.title,
    price = EXCLUDED.price,
    description = EXCLUDED.description,
    "keyNotes" = EXCLUDED."keyNotes",
    image_url = EXCLUDED.image_url,
    thumbnails = EXCLUDED.thumbnails,
    status = EXCLUDED.status,
    quantity = EXCLUDED.quantity,
    tags = EXCLUDED.tags;
INSERT INTO product (id, brand, title, price, description, "keyNotes", image_url, thumbnails, status, quantity, tags) VALUES ('PRD741797', 'Amouage', 'Honor', 10.0, 'Amouage Honour Eau de Parfum', NULL, 'honor.jpg', 'honor.jpg', 'restocked', 10, NULL)
  ON CONFLICT (id) DO UPDATE SET
    brand = EXCLUDED.brand,
    title = EXCLUDED.title,
    price = EXCLUDED.price,
    description = EXCLUDED.description,
    "keyNotes" = EXCLUDED."keyNotes",
    image_url = EXCLUDED.image_url,
    thumbnails = EXCLUDED.thumbnails,
    status = EXCLUDED.status,
    quantity = EXCLUDED.quantity,
    tags = EXCLUDED.tags;
INSERT INTO product (id, brand, title, price, description, "keyNotes", image_url, thumbnails, status, quantity, tags) VALUES ('PRD742482', 'Amouage', 'Jubilation 40', 12.0, 'Amouage Jubilation 40 Man Extrait de Parfum', NULL, 'jubilation_40.jpg', 'jubilation_40.jpg', 'restocked', 10, NULL)
  ON CONFLICT (id) DO UPDATE SET
    brand = EXCLUDED.brand,
    title = EXCLUDED.title,
    price = EXCLUDED.price,
    description = EXCLUDED.description,
    "keyNotes" = EXCLUDED."keyNotes",
    image_url = EXCLUDED.image_url,
    thumbnails = EXCLUDED.thumbnails,
    status = EXCLUDED.status,
    quantity = EXCLUDED.quantity,
    tags = EXCLUDED.tags;
INSERT INTO product (id, brand, title, price, description, "keyNotes", image_url, thumbnails, status, quantity, tags) VALUES ('PRD743258', 'Amouage', 'Jubilation XXV', 12.0, 'Amouage Jubilation XXV Man Eau de Parfum', NULL, 'jubilation_xxv', 'jubilation_xxv', 'restocked', 10, NULL)
  ON CONFLICT (id) DO UPDATE SET
    brand = EXCLUDED.brand,
    title = EXCLUDED.title,
    price = EXCLUDED.price,
    description = EXCLUDED.description,
    "keyNotes" = EXCLUDED."keyNotes",
    image_url = EXCLUDED.image_url,
    thumbnails = EXCLUDED.thumbnails,
    status = EXCLUDED.status,
    quantity = EXCLUDED.quantity,
    tags = EXCLUDED.tags;
INSERT INTO product (id, brand, title, price, description, "keyNotes", image_url, thumbnails, status, quantity, tags) VALUES ('PRD744439', 'Amouage', 'Decision', 13.0, 'Amouage Decision Eau de Parfum', NULL, '/static/decision.jpg', 'decision.jpg', 'restocked', 10, NULL)
  ON CONFLICT (id) DO UPDATE SET
    brand = EXCLUDED.brand,
    title = EXCLUDED.title,
    price = EXCLUDED.price,
    description = EXCLUDED.description,
    "keyNotes" = EXCLUDED."keyNotes",
    image_url = EXCLUDED.image_url,
    thumbnails = EXCLUDED.thumbnails,
    status = EXCLUDED.status,
    quantity = EXCLUDED.quantity,
    tags = EXCLUDED.tags;
INSERT INTO product (id, brand, title, price, description, "keyNotes", image_url, thumbnails, status, quantity, tags) VALUES ('PRD746327', 'Amouage', 'Epier', 13.0, 'Amouage Epic Eau de Parfum', NULL, 'epier.jpg', 'epier.jpg', 'restocked', 10, NULL)
  ON CONFLICT (id) DO UPDATE SET
    brand = EXCLUDED.brand,
    title = EXCLUDED.title,
    price = EXCLUDED.price,
    description = EXCLUDED.description,
    "keyNotes" = EXCLUDED."keyNotes",
    image_url = EXCLUDED.image_url,
    thumbnails = EXCLUDED.thumbnails,
    status = EXCLUDED.status,
    quantity = EXCLUDED.quantity,
    tags = EXCLUDED.tags;
INSERT INTO product (id, brand, title, price, description, "keyNotes", image_url, thumbnails, status, quantity, tags) VALUES ('PRD748208', 'Amouage', 'Interlude', 13.0, 'Amouage Interlude Man Eau de Parfum', NULL, 'interlude.jpg', 'interlude.jpg', 'restocked', 10, NULL)
  ON CONFLICT (id) DO UPDATE SET
    brand = EXCLUDED.brand,
    title = EXCLUDED.title,
    price = EXCLUDED.price,
    description = EXCLUDED.description,
    "keyNotes" = EXCLUDED."keyNotes",
    image_url = EXCLUDED.image_url,
    thumbnails = EXCLUDED.thumbnails,
    status = EXCLUDED.status,
    quantity = EXCLUDED.quantity,
    tags = EXCLUDED.tags;
INSERT INTO product (id, brand, title, price, description, "keyNotes", image_url, thumbnails, status, quantity, tags) VALUES ('PRD748572', 'Amouage', '1.53', 13.0, 'Amouage Interlude 53 Man Extrait de Parfum', NULL, '/static/153.jpg', '153.jpg', 'restocked', 10, NULL)
  ON CONFLICT (id) DO UPDATE SET
    brand = EXCLUDED.brand,
    title = EXCLUDED.title,
    price = EXCLUDED.price,
    description = EXCLUDED.description,
    "keyNotes" = EXCLUDED."keyNotes",
    image_url = EXCLUDED.image_url,
    thumbnails = EXCLUDED.thumbnails,
    status = EXCLUDED.status,
    quantity = EXCLUDED.quantity,
    tags = EXCLUDED.tags;
INSERT INTO product (id, brand, title, price, description, "keyNotes", image_url, thumbnails, status, quantity, tags) VALUES ('PRD749359', 'Amouage', 'Encla', 13.0, 'Amouage Enclave Eau de Parfum', NULL, 'encla.jpg', 'encla.jpg', 'restocked', 10, NULL)
  ON CONFLICT (id) DO UPDATE SET
    brand = EXCLUDED.brand,
    title = EXCLUDED.title,
    price = EXCLUDED.price,
    description = EXCLUDED.description,
    "keyNotes" = EXCLUDED."keyNotes",
    image_url = EXCLUDED.image_url,
    thumbnails = EXCLUDED.thumbnails,
    status = EXCLUDED.status,
    quantity = EXCLUDED.quantity,
    tags = EXCLUDED.tags;

INSERT INTO homepage_product (homepage_id, section, product_id, sort_order, visible) VALUES (1, 'signature', PRD001, 1, true)
  ON CONFLICT (homepage_id) DO UPDATE SET
    section = EXCLUDED.section,
    product_id = EXCLUDED.product_id,
    sort_order = EXCLUDED.sort_order,
    visible = EXCLUDED.visible;
INSERT INTO homepage_product (homepage_id, section, product_id, sort_order, visible) VALUES (2, 'men', PRD002, 2, true)
  ON CONFLICT (homepage_id) DO UPDATE SET
    section = EXCLUDED.section,
    product_id = EXCLUDED.product_id,
    sort_order = EXCLUDED.sort_order,
    visible = EXCLUDED.visible;
INSERT INTO homepage_product (homepage_id, section, product_id, sort_order, visible) VALUES (3, 'women', PRD003, 3, true)
  ON CONFLICT (homepage_id) DO UPDATE SET
    section = EXCLUDED.section,
    product_id = EXCLUDED.product_id,
    sort_order = EXCLUDED.sort_order,
    visible = EXCLUDED.visible;
INSERT INTO homepage_product (homepage_id, section, product_id, sort_order, visible) VALUES (4, 'offers', PRD003, 0, true)
  ON CONFLICT (homepage_id) DO UPDATE SET
    section = EXCLUDED.section,
    product_id = EXCLUDED.product_id,
    sort_order = EXCLUDED.sort_order,
    visible = EXCLUDED.visible;
INSERT INTO homepage_product (homepage_id, section, product_id, sort_order, visible) VALUES (5, 'men', PRD002, 0, true)
  ON CONFLICT (homepage_id) DO UPDATE SET
    section = EXCLUDED.section,
    product_id = EXCLUDED.product_id,
    sort_order = EXCLUDED.sort_order,
    visible = EXCLUDED.visible;
INSERT INTO homepage_product (homepage_id, section, product_id, sort_order, visible) VALUES (6, 'signature', PRD003, 0, true)
  ON CONFLICT (homepage_id) DO UPDATE SET
    section = EXCLUDED.section,
    product_id = EXCLUDED.product_id,
    sort_order = EXCLUDED.sort_order,
    visible = EXCLUDED.visible;
INSERT INTO homepage_product (homepage_id, section, product_id, sort_order, visible) VALUES (7, 'signature', PRD159062, 0, true)
  ON CONFLICT (homepage_id) DO UPDATE SET
    section = EXCLUDED.section,
    product_id = EXCLUDED.product_id,
    sort_order = EXCLUDED.sort_order,
    visible = EXCLUDED.visible;

INSERT INTO coupon (code, description, discount_type, discount_value, start_date, end_date, active) VALUES ('WELCOME10', '10% off for new customers', 'percent', 10.0, '2025-09-01', '2025-12-31', true)
  ON CONFLICT (code) DO UPDATE SET
    description = EXCLUDED.description,
    discount_type = EXCLUDED.discount_type,
    discount_value = EXCLUDED.discount_value,
    start_date = EXCLUDED.start_date,
    end_date = EXCLUDED.end_date,
    active = EXCLUDED.active;
INSERT INTO coupon (code, description, discount_type, discount_value, start_date, end_date, active) VALUES ('FALLSALE25', '25 USD off Fall Sale', 'fixed', 25.0, '2025-09-15', '2025-10-25', true)
  ON CONFLICT (code) DO UPDATE SET
    description = EXCLUDED.description,
    discount_type = EXCLUDED.discount_type,
    discount_value = EXCLUDED.discount_value,
    start_date = EXCLUDED.start_date,
    end_date = EXCLUDED.end_date,
    active = EXCLUDED.active;

