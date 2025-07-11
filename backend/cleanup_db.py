#!/usr/bin/env python3
"""
Database cleanup utility for Grimoire
"""

import sqlite3
import os
import argparse
from datetime import datetime, timedelta

def get_db_connection():
    """Get database connection"""
    db_path = "./grimoire.db"
    if not os.path.exists(db_path):
        print(f"Database not found at {db_path}")
        return None
    return sqlite3.connect(db_path)

def show_database_stats():
    """Show current database statistics"""
    conn = get_db_connection()
    if not conn:
        return
    
    cursor = conn.cursor()
    
    # Get project count
    cursor.execute("SELECT COUNT(*) FROM projects")
    project_count = cursor.fetchone()[0]
    
    # Get history count
    cursor.execute("SELECT COUNT(*) FROM prompt_history")
    history_count = cursor.fetchone()[0]
    
    # Get database size
    cursor.execute("SELECT page_count * page_size as size FROM pragma_page_count(), pragma_page_size()")
    db_size = cursor.fetchone()[0]
    
    print(f"\n📊 Database Statistics:")
    print(f"   Projects: {project_count}")
    print(f"   History entries: {history_count}")
    print(f"   Database size: {db_size / 1024:.2f} KB")
    
    # Show recent activity
    cursor.execute("""
        SELECT p.name, COUNT(h.id) as history_count, MAX(h.created_at) as last_activity
        FROM projects p 
        LEFT JOIN prompt_history h ON p.id = h.project_id 
        GROUP BY p.id, p.name 
        ORDER BY last_activity DESC
    """)
    
    projects = cursor.fetchall()
    if projects:
        print(f"\n📋 Projects Overview:")
        for name, hist_count, last_activity in projects:
            last_activity = last_activity or "Never"
            print(f"   • {name}: {hist_count} entries, last used: {last_activity}")
    
    conn.close()

def clean_old_history(days=30):
    """Remove history entries older than specified days"""
    conn = get_db_connection()
    if not conn:
        return
    
    cursor = conn.cursor()
    cutoff_date = datetime.now() - timedelta(days=days)
    
    # Count entries to be deleted
    cursor.execute("""
        SELECT COUNT(*) FROM prompt_history 
        WHERE created_at < ?
    """, (cutoff_date,))
    
    count = cursor.fetchone()[0]
    
    if count == 0:
        print(f"✅ No history entries older than {days} days found.")
        conn.close()
        return
    
    print(f"🗑️  Found {count} history entries older than {days} days.")
    confirm = input("Delete these entries? (y/N): ")
    
    if confirm.lower() == 'y':
        cursor.execute("""
            DELETE FROM prompt_history 
            WHERE created_at < ?
        """, (cutoff_date,))
        
        deleted = cursor.rowcount
        conn.commit()
        print(f"✅ Deleted {deleted} old history entries.")
    else:
        print("❌ Cleanup cancelled.")
    
    conn.close()

def clean_empty_projects():
    """Remove projects with no history"""
    conn = get_db_connection()
    if not conn:
        return
    
    cursor = conn.cursor()
    
    # Find empty projects
    cursor.execute("""
        SELECT p.id, p.name FROM projects p 
        LEFT JOIN prompt_history h ON p.id = h.project_id 
        WHERE h.id IS NULL
    """)
    
    empty_projects = cursor.fetchall()
    
    if not empty_projects:
        print("✅ No empty projects found.")
        conn.close()
        return
    
    print(f"🗑️  Found {len(empty_projects)} empty projects:")
    for proj_id, name in empty_projects:
        print(f"   • {name}")
    
    confirm = input("Delete these empty projects? (y/N): ")
    
    if confirm.lower() == 'y':
        for proj_id, name in empty_projects:
            cursor.execute("DELETE FROM projects WHERE id = ?", (proj_id,))
        
        conn.commit()
        print(f"✅ Deleted {len(empty_projects)} empty projects.")
    else:
        print("❌ Cleanup cancelled.")
    
    conn.close()

def vacuum_database():
    """Optimize database and reclaim space"""
    conn = get_db_connection()
    if not conn:
        return
    
    print("🔧 Optimizing database...")
    
    # Get size before
    cursor = conn.cursor()
    cursor.execute("SELECT page_count * page_size as size FROM pragma_page_count(), pragma_page_size()")
    size_before = cursor.fetchone()[0]
    
    # Vacuum
    conn.execute("VACUUM")
    
    # Get size after
    cursor.execute("SELECT page_count * page_size as size FROM pragma_page_count(), pragma_page_size()")
    size_after = cursor.fetchone()[0]
    
    saved = size_before - size_after
    print(f"✅ Database optimized. Saved {saved / 1024:.2f} KB")
    
    conn.close()

def reset_database():
    """Completely reset the database"""
    print("⚠️  WARNING: This will delete ALL data!")
    print("   • All projects will be removed")
    print("   • All prompt history will be removed") 
    print("   • This action cannot be undone")
    
    confirm = input("\nAre you absolutely sure? Type 'DELETE ALL' to confirm: ")
    
    if confirm == "DELETE ALL":
        db_path = "./grimoire.db"
        if os.path.exists(db_path):
            os.remove(db_path)
            print("✅ Database completely reset.")
            print("💡 Restart the backend to recreate an empty database.")
        else:
            print("❌ Database file not found.")
    else:
        print("❌ Reset cancelled.")

def main():
    parser = argparse.ArgumentParser(description="Grimoire Database Cleanup Utility")
    parser.add_argument("--stats", action="store_true", help="Show database statistics")
    parser.add_argument("--clean-old", type=int, metavar="DAYS", help="Remove history older than N days")
    parser.add_argument("--clean-empty", action="store_true", help="Remove projects with no history")
    parser.add_argument("--vacuum", action="store_true", help="Optimize database and reclaim space")
    parser.add_argument("--reset", action="store_true", help="DANGER: Completely reset database")
    
    args = parser.parse_args()
    
    if not any(vars(args).values()):
        # No arguments provided, show interactive menu
        print("🧹 Grimoire Database Cleanup Utility")
        print("=====================================")
        
        while True:
            show_database_stats()
            print(f"\nOptions:")
            print("1. Clean old history (remove entries older than X days)")
            print("2. Remove empty projects")
            print("3. Optimize database (VACUUM)")
            print("4. Show statistics")
            print("5. RESET database (delete everything)")
            print("6. Exit")
            
            choice = input("\nSelect option (1-6): ").strip()
            
            if choice == "1":
                days = input("Remove history older than how many days? [30]: ").strip()
                days = int(days) if days else 30
                clean_old_history(days)
            elif choice == "2":
                clean_empty_projects()
            elif choice == "3":
                vacuum_database()
            elif choice == "4":
                continue  # Will show stats at top of loop
            elif choice == "5":
                reset_database()
            elif choice == "6":
                break
            else:
                print("❌ Invalid option")
            
            input("\nPress Enter to continue...")
    else:
        # Command line arguments provided
        if args.stats:
            show_database_stats()
        if args.clean_old:
            clean_old_history(args.clean_old)
        if args.clean_empty:
            clean_empty_projects()
        if args.vacuum:
            vacuum_database()
        if args.reset:
            reset_database()

if __name__ == "__main__":
    main()