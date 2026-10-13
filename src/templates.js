// Local SQLite starter schemas. These are not Microsoft Access templates or .accdb files.
export const templates = [
  {
    kind: 'contacts', title: 'Contacts', icon: '♙', description: 'People, organisations and contact details.', table: 'Contacts',
    sql: `CREATE TABLE Contacts (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, organisation TEXT, email TEXT, phone TEXT, notes TEXT);`
  },
  {
    kind: 'assets', title: 'Asset tracking', icon: '▣', description: 'Track assets, locations and assignments.', table: 'Assets',
    sql: `CREATE TABLE Locations (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, address TEXT);
CREATE TABLE Assets (id INTEGER PRIMARY KEY AUTOINCREMENT, asset_tag TEXT UNIQUE, name TEXT NOT NULL, category TEXT, purchase_date TEXT, purchase_price REAL, location_id INTEGER REFERENCES Locations(id), status TEXT DEFAULT 'Available');
CREATE TABLE AssetAssignments (id INTEGER PRIMARY KEY AUTOINCREMENT, asset_id INTEGER NOT NULL REFERENCES Assets(id), assigned_to TEXT NOT NULL, assigned_date TEXT, returned_date TEXT);`
  },
  {
    kind: 'students', title: 'Students', icon: '▤', description: 'Students, courses and enrolments.', table: 'Students',
    sql: `CREATE TABLE Students (id INTEGER PRIMARY KEY AUTOINCREMENT, first_name TEXT NOT NULL, last_name TEXT NOT NULL, email TEXT, enrolled_date TEXT);
CREATE TABLE Courses (id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT UNIQUE, title TEXT NOT NULL, instructor TEXT);
CREATE TABLE Enrolments (id INTEGER PRIMARY KEY AUTOINCREMENT, student_id INTEGER NOT NULL REFERENCES Students(id), course_id INTEGER NOT NULL REFERENCES Courses(id), enrolled_date TEXT, grade TEXT, UNIQUE(student_id, course_id));`
  },
  {
    kind: 'events', title: 'Event management', icon: '▧', description: 'Events, attendees and registrations.', table: 'Events',
    sql: `CREATE TABLE Events (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, start_date TEXT, end_date TEXT, venue TEXT, description TEXT);
CREATE TABLE Attendees (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, email TEXT, phone TEXT);
CREATE TABLE Registrations (id INTEGER PRIMARY KEY AUTOINCREMENT, event_id INTEGER NOT NULL REFERENCES Events(id), attendee_id INTEGER NOT NULL REFERENCES Attendees(id), registered_date TEXT, status TEXT DEFAULT 'Registered', UNIQUE(event_id, attendee_id));`
  },
  {
    kind: 'tasks', title: 'Task management', icon: '☑', description: 'Track tasks, owners, priorities and due dates.', table: 'Tasks',
    sql: `CREATE TABLE Tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, owner TEXT, priority TEXT DEFAULT 'Normal', due_date TEXT, completed INTEGER NOT NULL DEFAULT 0);`
  },
  {
    kind: 'nutrition', title: 'Nutrition tracking', icon: '◉', description: 'Foods, meals and portions.', table: 'Meals',
    sql: `CREATE TABLE Foods (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, serving_size TEXT, calories REAL, protein_g REAL, carbohydrate_g REAL, fat_g REAL);
CREATE TABLE Meals (id INTEGER PRIMARY KEY AUTOINCREMENT, meal_date TEXT NOT NULL, name TEXT NOT NULL, notes TEXT);
CREATE TABLE MealItems (id INTEGER PRIMARY KEY AUTOINCREMENT, meal_id INTEGER NOT NULL REFERENCES Meals(id), food_id INTEGER NOT NULL REFERENCES Foods(id), servings REAL NOT NULL DEFAULT 1);`
  },
  {
    kind: 'charity', title: 'Charitable contributions', icon: '♧', description: 'Donors, campaigns and donations.', table: 'Donations',
    sql: `CREATE TABLE Donors (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, email TEXT, phone TEXT, address TEXT);
CREATE TABLE Campaigns (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, start_date TEXT, end_date TEXT, goal_amount REAL);
CREATE TABLE Donations (id INTEGER PRIMARY KEY AUTOINCREMENT, donor_id INTEGER NOT NULL REFERENCES Donors(id), campaign_id INTEGER REFERENCES Campaigns(id), donated_date TEXT NOT NULL, amount REAL NOT NULL CHECK(amount >= 0), notes TEXT);`
  },
  {
    kind: 'inventory', title: 'Inventory', icon: '▦', description: 'Products, quantities and stock locations.', table: 'Products',
    sql: `CREATE TABLE Products (id INTEGER PRIMARY KEY AUTOINCREMENT, sku TEXT UNIQUE, product_name TEXT NOT NULL, quantity INTEGER NOT NULL DEFAULT 0, location TEXT, unit_price REAL);`
  }
];

export const featuredTemplates = templates.filter(template => template.kind !== 'inventory');
