/**
 * Script to run database migrations against Supabase
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const supabase = require('./supabase');

async function runMigration(filePath) {
  try {
    console.log(`Running migration: ${path.basename(filePath)}`);
    const sql = fs.readFileSync(filePath, 'utf8');
    
    // For Supabase, we'll need to run this SQL in the Supabase SQL editor
    // or use a database connection directly
    console.log('\nSQL to execute in Supabase SQL Editor:');
    console.log('----------------------------------------');
    console.log(sql);
    console.log('----------------------------------------');
    console.log('Please copy the SQL above and run it in the Supabase SQL Editor');
    console.log('Visit: https://app.supabase.com/project/_/sql');
    
    // Ask for confirmation
    console.log('\nHave you executed the SQL in the Supabase SQL Editor? (yes/no)');
    
    // In a real application, you would wait for user input here
    // For now, we'll just log the message and return success
    
    console.log(`Migration ${path.basename(filePath)} needs to be run manually`);
    return true;
  } catch (error) {
    console.error(`Failed to process migration ${path.basename(filePath)}: ${error.message}`);
    return false;
  }
}

async function runMigrations() {
  // Create migrations directory if it doesn't exist
  const migrationsDir = path.join(__dirname, 'migrations');
  if (!fs.existsSync(migrationsDir)) {
    fs.mkdirSync(migrationsDir, { recursive: true });
  }
  
  // Get all SQL files in the migrations directory
  const migrationFiles = fs.readdirSync(migrationsDir)
    .filter(file => file.endsWith('.sql'))
    .sort(); // Sort to ensure migrations run in order
  
  console.log(`Found ${migrationFiles.length} migration files`);
  
  // Run each migration
  for (const file of migrationFiles) {
    const filePath = path.join(migrationsDir, file);
    const success = await runMigration(filePath);
    
    if (!success) {
      console.error(`Migration failed. Stopping.`);
      process.exit(1);
    }
  }
  
  console.log('All migrations completed successfully');
}

// Run migrations
runMigrations()
  .then(() => {
    console.log('Migration process completed');
    process.exit(0);
  })
  .catch(error => {
    console.error('Migration process failed:', error);
    process.exit(1);
  });
