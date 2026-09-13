# Legacy MongoDB ObjectId to PostgreSQL UUID Mapping Reference

During the migration, all MongoDB 24-character hexadecimal `ObjectId` strings (e.g. `68aee4641324fa752eb9b68c`) were deterministically mapped to PostgreSQL standard 36-character `UUID v4` strings.

---

## 1. Mapping File: `mongo-id-mapping.json`

The file `migration-scripts/mongo-id-mapping.json` is generated automatically during `migrate-data.js` and contains a direct dictionary lookup:

```json
{
  "<mongo_24_char_hex_id>": "<postgres_uuid>"
}
```

### Purpose & Use Cases:
1. **Audit & Traceability**: Cross-reference any legacy record against the new database without ambiguity.
2. **Third-Party Integrations**: If any external webhook, analytics, affiliate feed, or partner system references MongoDB ObjectIds, use `mongo-id-mapping.json` to resolve them to the corresponding PostgreSQL row.
3. **Idempotent Re-runs**: Ensures that if the migration is re-run, existing records update smoothly and foreign keys link to the exact same UUIDs.

---

## 2. Key Collections ID Mappings Summary

### Stores
| MongoDB `_id` | Store Name | Slug | PostgreSQL `id` (UUID) |
|---|---|---|---|
| `68aee4641324fa752eb9b68c` | Brennan Kirk | `ut-autem-modi-omnis` | `4c84a568-7c87-4347-8a6a-d249f3f09511` |
| `68aee4ac1324fa752eb9b6b7` | Althea Odom | `molestias-ea-repell` | `5717b189-d4c3-42e7-8b01-a182c89f5bc3` |
| `68af05b21324fa752eb9b7d8` | Ainsley Reynolds | `aliquam-rerum-sit-m` | `26ff6b1f-0bdf-4cb9-b8ae-ae9f6b92a2a7` |

### Categories
| MongoDB `_id` | Category Name | Slug | PostgreSQL `id` (UUID) | Notes |
|---|---|---|---|---|
| `68aedf611324fa752eb9b5b2` | Dennis Snider | `in-adipisicing-nost` | `7ee39b19-f00e-4ba0-a083-0570b556f8f4` | Migrated |
| `68aeeb6b1324fa752eb9b703` | Savannah Mcconnell | `quia-dolorum-ex-ass` | `6ae229d7-83d7-4bf7-9eb5-8e7c154378f8` | Migrated |
| *Synthesized* | Uncategorised | `uncategorised` | `9dbdc242-70b1-4ebc-bf95-0fcb74955b76` | Fallback for orphaned records |

### Subcategories
| MongoDB `_id` | Subcategory Name | Slug | PostgreSQL `id` (UUID) | Parent Category |
|---|---|---|---|---|
| `68aeed031324fa752eb9b70b` | kj | `kj` | `d72e7fc4-369b-4680-a681-3aa21481d63a` | Linked to `Uncategorised` (was orphan in Mongo) |

---

## 3. How IDs Are Resolved in Code

The migration script uses `resolveId(mongoDoc._id, collectionName)`:

```javascript
function resolveId(mongoId, collectionName) {
  if (!mongoId) return randomUUID();
  const key = String(mongoId);
  if (!idMap[key]) {
    idMap[key] = randomUUID();
  }
  return idMap[key];
}
```

At the end of the data migration run, `idMap` is automatically flushed to `mongo-id-mapping.json`.

---

## 4. Querying by Legacy ID

If you need to find a record in PostgreSQL by its legacy MongoDB `_id`:

```bash
# Example: Find PostgreSQL UUID for MongoDB ID 68aee4641324fa752eb9b68c
node -e '
const map = require("./mongo-id-mapping.json");
const mongoId = "68aee4641324fa752eb9b68c";
console.log("PostgreSQL UUID:", map[mongoId]);
'
```
