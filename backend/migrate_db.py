import sqlite3
import os

def migrate_database():
    db_path = "./grimoire.db"
    
    if not os.path.exists(db_path):
        print("Database does not exist. No migration needed.")
        return
    
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    try:
        # Check if rating column exists
        cursor.execute("PRAGMA table_info(prompt_history)")
        columns = [column[1] for column in cursor.fetchall()]
        
        if 'rating' not in columns:
            print("Adding 'rating' column to prompt_history table...")
            cursor.execute("ALTER TABLE prompt_history ADD COLUMN rating TEXT")
            print("✓ Added 'rating' column")
        else:
            print("✓ 'rating' column already exists")
        
        if 'notes' not in columns:
            print("Adding 'notes' column to prompt_history table...")
            cursor.execute("ALTER TABLE prompt_history ADD COLUMN notes TEXT")
            print("✓ Added 'notes' column")
        else:
            print("✓ 'notes' column already exists")
        
        conn.commit()
        print("Database migration completed successfully!")
        
    except Exception as e:
        print(f"Migration failed: {e}")
        conn.rollback()
    finally:
        conn.close()

if __name__ == "__main__":
    migrate_database()