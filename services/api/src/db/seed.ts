import { hashPassword } from "../auth-service.js";
import { pool, withTransaction } from "./pool.js";

const password = "MarshEats123!";

interface SeedRestaurant {
  ownerEmail: string;
  ownerName: string;
  ownerPhone: string;
  name: string;
  slug: string;
  cuisineTypes: string[];
  description: string;
  phone: string;
  email: string;
  addressLine1: string;
  addressLine2?: string;
  town: string;
  county: string;
  postcode: string;
  minimumOrderPence: number;
  collectionEnabled: boolean;
  deliveryEnabled: boolean;
  estimatedPrepMinutes: number;
  logoUrl: string;
  categories: Array<{
    name: string;
    sortOrder: number;
    items: Array<{ name: string; description: string; pricePence: number; allergens: string[]; sortOrder: number }>;
  }>;
}

const restaurants: SeedRestaurant[] = [
  {
    ownerEmail: "owner.harbour@marsh-eats.test",
    ownerName: "Harriet Webb",
    ownerPhone: "+441227555021",
    name: "Whitstable Harbour Kitchen",
    slug: "whitstable-harbour-kitchen",
    cuisineTypes: ["Seafood", "British"],
    description: "Fresh Kent coast seafood, daily chowders, and family favourites minutes from the harbour.",
    phone: "+441227555101",
    email: "hello@harbour-kitchen.test",
    addressLine1: "4 Harbour Street",
    town: "Whitstable",
    county: "Kent",
    postcode: "CT5 1AG",
    minimumOrderPence: 1200,
    collectionEnabled: true,
    deliveryEnabled: true,
    estimatedPrepMinutes: 25,
    logoUrl: "https://images.unsplash.com/photo-1559339352-11d035aa65de?auto=format&fit=crop&w=900&q=80",
    categories: [
      { name: "Harbour Classics", sortOrder: 1, items: [
        { name: "Whitstable Fish & Chips", description: "Line-caught cod in crisp batter with chips, tartare, and lemon.", pricePence: 1395, allergens: ["fish", "gluten", "egg"], sortOrder: 1 },
        { name: "Smoked Haddock Chowder", description: "Creamy chowder with leeks, potatoes, herbs, and sourdough.", pricePence: 895, allergens: ["fish", "milk", "gluten"], sortOrder: 2 }
      ]},
      { name: "Sides", sortOrder: 2, items: [
        { name: "Sea Salt Chips", description: "Double-cooked chips finished with Maldon sea salt.", pricePence: 395, allergens: [], sortOrder: 1 },
        { name: "Kentish Slaw", description: "Crunchy cabbage, carrot, apple, and mustard dressing.", pricePence: 325, allergens: ["mustard"], sortOrder: 2 }
      ]}
    ]
  },
  {
    ownerEmail: "owner.garden@marsh-eats.test",
    ownerName: "Priya Shah",
    ownerPhone: "+441227555022",
    name: "Canterbury Garden Curry",
    slug: "canterbury-garden-curry",
    cuisineTypes: ["Indian", "Vegetarian"],
    description: "Slow-cooked curries, tandoor grills, and generous vegetarian plates from Canterbury.",
    phone: "+441227555102",
    email: "orders@garden-curry.test",
    addressLine1: "18 St Margaret's Street",
    town: "Canterbury",
    county: "Kent",
    postcode: "CT1 2TG",
    minimumOrderPence: 1500,
    collectionEnabled: true,
    deliveryEnabled: true,
    estimatedPrepMinutes: 35,
    logoUrl: "https://images.unsplash.com/photo-1585937421612-70a008356fbe?auto=format&fit=crop&w=900&q=80",
    categories: [
      { name: "Curries", sortOrder: 1, items: [
        { name: "Chicken Tikka Masala", description: "Tandoori chicken in a rich tomato, almond, and cream sauce.", pricePence: 1195, allergens: ["milk", "nuts"], sortOrder: 1 },
        { name: "Paneer Makhani", description: "Paneer simmered with butter, tomato, fenugreek, and cardamom.", pricePence: 1095, allergens: ["milk"], sortOrder: 2 }
      ]},
      { name: "Rice & Breads", sortOrder: 2, items: [
        { name: "Pilau Rice", description: "Basmati rice with saffron, cardamom, and fried onion.", pricePence: 325, allergens: [], sortOrder: 1 },
        { name: "Garlic Naan", description: "Tandoor-baked naan brushed with garlic coriander butter.", pricePence: 350, allergens: ["gluten", "milk"], sortOrder: 2 }
      ]}
    ]
  },
  {
    ownerEmail: "owner.pier@marsh-eats.test",
    ownerName: "Marco Bellini",
    ownerPhone: "+441843555023",
    name: "Margate Pier Pizza",
    slug: "margate-pier-pizza",
    cuisineTypes: ["Pizza", "Italian"],
    description: "Stone-baked sourdough pizza, seasonal salads, and gelato by the sea.",
    phone: "+441843555103",
    email: "ciao@pier-pizza.test",
    addressLine1: "27 Marine Terrace",
    town: "Margate",
    county: "Kent",
    postcode: "CT9 1XJ",
    minimumOrderPence: 1000,
    collectionEnabled: true,
    deliveryEnabled: false,
    estimatedPrepMinutes: 20,
    logoUrl: "https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?auto=format&fit=crop&w=900&q=80",
    categories: [
      { name: "Sourdough Pizza", sortOrder: 1, items: [
        { name: "Margherita", description: "San Marzano tomato, mozzarella, basil, and extra virgin olive oil.", pricePence: 995, allergens: ["gluten", "milk"], sortOrder: 1 },
        { name: "Kentish Pepperoni", description: "Mozzarella, tomato, pepperoni, chilli honey, and oregano.", pricePence: 1295, allergens: ["gluten", "milk"], sortOrder: 2 }
      ]},
      { name: "Desserts", sortOrder: 2, items: [
        { name: "Lemon Gelato", description: "Bright Amalfi lemon gelato in a compostable cup.", pricePence: 425, allergens: ["milk"], sortOrder: 1 },
        { name: "Tiramisu Pot", description: "Coffee-soaked sponge, mascarpone cream, and cocoa.", pricePence: 495, allergens: ["egg", "milk", "gluten"], sortOrder: 2 }
      ]}
    ]
  }
];

async function ensureDevColumns() {
  await pool.query(`alter table restaurants add column if not exists logo_url text`);
  await pool.query(`alter table restaurants add column if not exists estimated_prep_minutes integer not null default 30 check (estimated_prep_minutes > 0)`);
  await pool.query(`alter table orders add column if not exists customer_name text`);
  await pool.query(`alter table orders add column if not exists customer_email citext`);
  await pool.query(`alter table orders add column if not exists customer_phone text`);
  await pool.query(`alter table orders add column if not exists delivery_address_snapshot jsonb`);
}

async function upsertUser(email: string, fullName: string, role: "customer" | "restaurant_owner" | "admin", phone?: string) {
  const { rows } = await pool.query(
    `insert into users (email, phone, password_hash, full_name, role, is_active)
     values ($1,$2,$3,$4,$5,true)
     on conflict (email) do update set phone = excluded.phone, full_name = excluded.full_name, role = excluded.role, is_active = true, updated_at = now(), deleted_at = null
     returning id`,
    [email, phone ?? null, hashPassword(password, `seed-${email}`.slice(0, 16)), fullName, role]
  );
  return rows[0].id as string;
}

async function seed() {
  await ensureDevColumns();
  await withTransaction(async (client) => {
    const region = await client.query(
      `insert into regions (name, slug, country_code, postcode_prefixes, is_active)
       values ('Kent Coast', 'kent-coast', 'GB', $1, true)
       on conflict (slug) do update set postcode_prefixes = excluded.postcode_prefixes, is_active = true, updated_at = now()
       returning id`,
      [["CT", "ME", "TN"]]
    );
    const regionId = region.rows[0].id as string;

    const customerId = await upsertUser("customer@marsh-eats.test", "Casey Customer", "customer", "+447700900111");
    const existingAddress = await client.query(
      `select id from user_addresses where user_id = $1 and label = 'Home' and deleted_at is null limit 1`,
      [customerId]
    );
    if (existingAddress.rowCount) {
      await client.query(
        `update user_addresses set line1 = '12 Beach Walk', town = 'Whitstable', county = 'Kent', postcode = 'CT5 2BP', is_default = true, updated_at = now() where id = $1`,
        [existingAddress.rows[0].id]
      );
    } else {
      await client.query(
        `insert into user_addresses (user_id, label, line1, town, county, postcode, is_default)
         values ($1, 'Home', '12 Beach Walk', 'Whitstable', 'Kent', 'CT5 2BP', true)`,
        [customerId]
      );
    }
    await upsertUser("admin@marsh-eats.test", "Ada Admin", "admin", "+447700900999");

    for (const restaurant of restaurants) {
      const ownerId = await upsertUser(restaurant.ownerEmail, restaurant.ownerName, "restaurant_owner", restaurant.ownerPhone);
      const savedRestaurant = await client.query(
        `insert into restaurants (owner_user_id, region_id, name, slug, status, cuisine_types, description, phone, email,
          address_line1, address_line2, town, county, postcode, minimum_order_pence, collection_enabled, delivery_enabled,
          is_accepting_orders, logo_url, estimated_prep_minutes)
         values ($1,$2,$3,$4,'active',$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,true,$17,$18)
         on conflict (slug) do update set owner_user_id = excluded.owner_user_id, region_id = excluded.region_id, name = excluded.name,
          status = 'active', cuisine_types = excluded.cuisine_types, description = excluded.description, phone = excluded.phone,
          email = excluded.email, address_line1 = excluded.address_line1, address_line2 = excluded.address_line2, town = excluded.town,
          county = excluded.county, postcode = excluded.postcode, minimum_order_pence = excluded.minimum_order_pence,
          collection_enabled = excluded.collection_enabled, delivery_enabled = excluded.delivery_enabled, is_accepting_orders = true,
          logo_url = excluded.logo_url, estimated_prep_minutes = excluded.estimated_prep_minutes, updated_at = now(), deleted_at = null
         returning id`,
        [ownerId, regionId, restaurant.name, restaurant.slug, restaurant.cuisineTypes, restaurant.description, restaurant.phone, restaurant.email,
          restaurant.addressLine1, restaurant.addressLine2 ?? null, restaurant.town, restaurant.county, restaurant.postcode,
          restaurant.minimumOrderPence, restaurant.collectionEnabled, restaurant.deliveryEnabled, restaurant.logoUrl, restaurant.estimatedPrepMinutes]
      );
      const restaurantId = savedRestaurant.rows[0].id as string;
      await client.query(
        `insert into restaurant_staff_members (restaurant_id, user_id, role) values ($1,$2,'restaurant_owner')
         on conflict (restaurant_id, user_id) do update set role = 'restaurant_owner'`,
        [restaurantId, ownerId]
      );
      const existingMenu = await client.query(`select id from menus where restaurant_id = $1 and name = 'Main Menu' limit 1`, [restaurantId]);
      let menuId = existingMenu.rows[0]?.id as string | undefined;
      if (!menuId) {
        const menu = await client.query(
          `insert into menus (restaurant_id, name, is_active) values ($1, 'Main Menu', true) returning id`,
          [restaurantId]
        );
        menuId = menu.rows[0].id as string;
      }
      await client.query(`update menus set is_active = true, updated_at = now() where id = $1`, [menuId]);
      for (const category of restaurant.categories) {
        const savedCategory = await client.query(
          `with existing as (select id from menu_categories where menu_id = $1 and name = $2 limit 1),
           inserted as (insert into menu_categories (menu_id, name, sort_order)
             select $1,$2,$3 where not exists (select 1 from existing) returning id)
           select id from inserted union all select id from existing`,
          [menuId, category.name, category.sortOrder]
        );
        const categoryId = savedCategory.rows[0].id as string;
        await client.query(`update menu_categories set sort_order = $1, updated_at = now() where id = $2`, [category.sortOrder, categoryId]);
        for (const item of category.items) {
          await client.query(
            `with existing as (select id from menu_items where category_id = $1 and name = $2 and deleted_at is null limit 1),
             inserted as (insert into menu_items (category_id, name, description, price_pence, allergens, is_available, sort_order)
               select $1,$2,$3,$4,$5,true,$6 where not exists (select 1 from existing) returning id)
             update menu_items set description = $3, price_pence = $4, allergens = $5, is_available = true, sort_order = $6, updated_at = now()
             where id in (select id from existing union all select id from inserted)`,
            [categoryId, item.name, item.description, item.pricePence, item.allergens, item.sortOrder]
          );
        }
      }
    }
  });
}

seed().then(async () => {
  console.log("Seeded Marsh Eats local MVP data.");
  console.log(`Password for all seeded users: ${password}`);
  await pool.end();
}).catch(async (error) => {
  console.error(error);
  await pool.end();
  process.exit(1);
});
