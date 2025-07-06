/**
 * Database schema for the WhatsApp Marketplace
 * 
 * This file contains the schema definitions that should be created in Supabase.
 * Use this as a reference when setting up your Supabase tables.
 */

/**
 * SQL for creating tables in Supabase:
 * 
 * -- Users Table
 * create table public.users (
 *   id uuid default uuid_generate_v4() primary key,
 *   phone_number text unique not null,
 *   name text,
 *   created_at timestamp with time zone default now(),
 *   updated_at timestamp with time zone default now(),
 *   is_verified boolean default false,
 *   rating decimal(3,2) default 0,
 *   total_ratings integer default 0,
 *   is_seller boolean default false
 * );
 * 
 * -- Groups Table
 * create table public.groups (
 *   id uuid default uuid_generate_v4() primary key,
 *   name text not null,
 *   description text,
 *   created_at timestamp with time zone default now(),
 *   updated_at timestamp with time zone default now(),
 *   is_verified boolean default false,
 *   category text
 * );
 * 
 * -- Listings Table
 * create table public.listings (
 *   id uuid default uuid_generate_v4() primary key,
 *   title text not null,
 *   description text not null,
 *   price decimal(12,2) not null,
 *   currency text default 'FCFA',
 *   seller_id uuid references public.users(id) not null,
 *   group_id uuid references public.groups(id),
 *   created_at timestamp with time zone default now(),
 *   updated_at timestamp with time zone default now(),
 *   status text default 'active',
 *   location text,
 *   category text,
 *   is_boosted boolean default false,
 *   boost_expires_at timestamp with time zone,
 *   views integer default 0
 * );
 * 
 * -- Images Table
 * create table public.images (
 *   id uuid default uuid_generate_v4() primary key,
 *   listing_id uuid references public.listings(id) not null,
 *   image_url text not null,
 *   created_at timestamp with time zone default now()
 * );
 * 
 * -- Transactions Table
 * create table public.transactions (
 *   id uuid default uuid_generate_v4() primary key,
 *   listing_id uuid references public.listings(id) not null,
 *   buyer_id uuid references public.users(id) not null,
 *   seller_id uuid references public.users(id) not null,
 *   amount decimal(12,2) not null,
 *   currency text default 'FCFA',
 *   status text default 'pending',
 *   created_at timestamp with time zone default now(),
 *   updated_at timestamp with time zone default now(),
 *   escrow_fee decimal(12,2),
 *   payment_provider text,
 *   payment_reference text,
 *   release_date timestamp with time zone
 * );
 * 
 * -- Ratings Table
 * create table public.ratings (
 *   id uuid default uuid_generate_v4() primary key,
 *   transaction_id uuid references public.transactions(id) not null,
 *   rating integer not null,
 *   comment text,
 *   created_at timestamp with time zone default now(),
 *   from_user_id uuid references public.users(id) not null,
 *   to_user_id uuid references public.users(id) not null
 * );
 * 
 * -- Search Alerts Table
 * create table public.search_alerts (
 *   id uuid default uuid_generate_v4() primary key,
 *   user_id uuid references public.users(id) not null,
 *   search_query text not null,
 *   created_at timestamp with time zone default now(),
 *   expires_at timestamp with time zone,
 *   is_active boolean default true
 * );
 */

// Database models for use in the application
const models = {
  // User model operations
  users: {
    create: async (supabase, userData) => {
      const { data, error } = await supabase
        .from('users')
        .insert([userData])
        .select();
      
      if (error) throw error;
      return data[0];
    },
    
    findByPhone: async (supabase, phoneNumber) => {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('phone_number', phoneNumber)
        .single();
      
      if (error && error.code !== 'PGRST116') throw error;
      return data;
    },
    
    update: async (supabase, userId, updates) => {
      const { data, error } = await supabase
        .from('users')
        .update(updates)
        .eq('id', userId)
        .select();
      
      if (error) throw error;
      return data[0];
    }
  },
  
  // Listing model operations
  listings: {
    create: async (supabase, listingData) => {
      const { data, error } = await supabase
        .from('listings')
        .insert([listingData])
        .select();
      
      if (error) throw error;
      return data[0];
    },
    
    search: async (supabase, query, filters = {}, limit = 10) => {
      let queryBuilder = supabase
        .from('listings')
        .select(`
          *,
          seller:seller_id(name, phone_number, rating),
          images(image_url)
        `)
        .eq('status', 'active');
      
      // Apply text search if provided
      if (query) {
        queryBuilder = queryBuilder.or(`title.ilike.%${query}%, description.ilike.%${query}%`);
      }
      
      // Apply filters
      if (filters.category) {
        queryBuilder = queryBuilder.eq('category', filters.category);
      }
      
      if (filters.location) {
        queryBuilder = queryBuilder.eq('location', filters.location);
      }
      
      if (filters.maxPrice) {
        queryBuilder = queryBuilder.lte('price', filters.maxPrice);
      }
      
      if (filters.minPrice) {
        queryBuilder = queryBuilder.gte('price', filters.minPrice);
      }
      
      // Order by boosted first, then by date
      queryBuilder = queryBuilder.order('is_boosted', { ascending: false })
                                .order('created_at', { ascending: false })
                                .limit(limit);
      
      const { data, error } = await queryBuilder;
      
      if (error) throw error;
      return data;
    },
    
    findById: async (supabase, id) => {
      const { data, error } = await supabase
        .from('listings')
        .select(`
          *,
          seller:seller_id(name, phone_number, rating),
          images(image_url)
        `)
        .eq('id', id)
        .single();
      
      if (error) throw error;
      return data;
    },
    
    incrementViews: async (supabase, id) => {
      const { data, error } = await supabase.rpc('increment_listing_views', { listing_id: id });
      
      if (error) throw error;
      return data;
    }
  },
  
  // Transaction model operations
  transactions: {
    create: async (supabase, transactionData) => {
      const { data, error } = await supabase
        .from('transactions')
        .insert([transactionData])
        .select();
      
      if (error) throw error;
      return data[0];
    },
    
    updateStatus: async (supabase, id, status) => {
      const { data, error } = await supabase
        .from('transactions')
        .update({ status, updated_at: new Date() })
        .eq('id', id)
        .select();
      
      if (error) throw error;
      return data[0];
    },
    
    findByUser: async (supabase, userId, role = 'buyer') => {
      const column = role === 'seller' ? 'seller_id' : 'buyer_id';
      
      const { data, error } = await supabase
        .from('transactions')
        .select(`
          *,
          listing:listing_id(*),
          buyer:buyer_id(name, phone_number),
          seller:seller_id(name, phone_number)
        `)
        .eq(column, userId)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data;
    }
  },
  
  // Rating model operations
  ratings: {
    create: async (supabase, ratingData) => {
      const { data, error } = await supabase
        .from('ratings')
        .insert([ratingData])
        .select();
      
      if (error) throw error;
      return data[0];
    },
    
    findByTransaction: async (supabase, transactionId) => {
      const { data, error } = await supabase
        .from('ratings')
        .select('*')
        .eq('transaction_id', transactionId)
        .single();
      
      if (error && error.code !== 'PGRST116') throw error;
      return data;
    }
  }
};

module.exports = models;
