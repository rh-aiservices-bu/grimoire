#!/usr/bin/env python3
"""
Migration to add is_prod column to prompt_history table
"""

import sqlite3
import os

def migrate_add_prod_column():
    db_path = "./grimoire.db"
    
    if not os.path.exists(db_path):
        print("Database does not exist. No migration needed.")
        return
    
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    try:
        # Check if is_prod column exists
        cursor.execute("PRAGMA table_info(prompt_history)")
        columns = [column[1] for column in cursor.fetchall()]
        
        if 'is_prod' not in columns:
            print("Adding 'is_prod' column to prompt_history table...")
            cursor.execute("ALTER TABLE prompt_history ADD COLUMN is_prod BOOLEAN DEFAULT FALSE")
            print("✓ Added 'is_prod' column")
        else:
            print("✓ 'is_prod' column already exists")
        
        conn.commit()
        print("Production tagging migration completed successfully!")
        
    except Exception as e:
        print(f"Migration failed: {e}")
        conn.rollback()
    finally:
        conn.close()

if __name__ == "__main__":
    migrate_add_prod_column()