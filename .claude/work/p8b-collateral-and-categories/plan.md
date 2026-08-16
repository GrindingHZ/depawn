# p8b-collateral-and-categories plan

The marketplace lends against physical things and shows none of them. Vault staff photograph every
item at intake, the bytes are stored under a content hash, and nothing in the product ever reads
them back: `ObjectStoragePort.get` has no caller. The listing a lender sees carries an appraised
value, a category enum, and a database key. This slice closes that gap and widens the catalogue
past bullion.

## Decisions taken with the owner

- **Five categories, priced by liquidity.** BULLION 6000, WATCH 5000, JEWELLERY 4500,
  COLLECTIBLE 3500, ART 3000 basis points. Lower cap where resale is slower and the appraisal is
  more nearly an opinion.
- **A photograph is visible when the item is on a published listing, or when it is yours.** Staff
  and operations see everything. Signed out sees nothing.
- **The bytes stay on the filesystem**, behind the port that already exists, hardened. A bucket
  adapter is a later swap and needs no domain change.

## Deliberate departure from the brief

No runtime thumbnail generation. It needs a native image dependency, and the keys are content
hashes, so every URL is already immutable and can be served with a long immutable cache. Deriving
sizes belongs with an image CDN at the point the bytes move to a bucket. Recorded as Q-025 rather
than done badly now.

## What is actually wrong today, beyond the missing wiring

- **Uploads are unbounded and unchecked.** No size limit, no declared type, no verification that
  the bytes are an image at all. Serving an uploaded SVG back from the same origin would be stored
  cross site scripting. This has to be fixed in the same slice that starts serving the bytes.
- **The evidence item records a label and a hash and no content type**, so nothing can answer what
  it should send back.
- **The loan to value lookup trusts the map.** A category with no cap yields `undefined`, which
  would flow into money arithmetic rather than failing. Five categories make that reachable.
- **The seed uploads the string `demo bytes <uuid>` labelled `front.jpg`.** The moment upload
  validates, the seed breaks. It has to produce real images.

## Tasks

1. `feat(domain): price loan to value by item category`: five categories, caps for each, the
   lookup fails loudly on an unmapped one.
2. `feat(db): widen the item category enum`: migration, no backfill needed, existing rows are
   already BULLION.
3. `feat(custody): verify an uploaded photograph before storing it`: size cap, magic byte sniff
   for JPEG and PNG only, content type recorded on the evidence item.
4. `test(custody): refuse the uploads that would hurt us`: oversize, wrong type, a renamed script,
   an empty file.
5. `feat(custody): serve a receipt photograph to whoever may see it`: the authenticated media
   endpoint and its authorisation rule.
6. `test(custody): the photograph respects who may see it`: every branch of the rule.
7. `feat(marketplace): carry the item through to the listing`: description, category, photograph
   presence on the listing DTO and the detail response.
8. `feat(seed): photograph the demo inventory`: generated PNGs, one per item, distinct by content.
9. `test(seed): the seeded inventory has real photographs`.

`p8c` follows with the surface: cards, the loan to value chip, the hero figure, and the explain
layer.

## Risks

- Widening a Postgres enum inside a transaction has a rule: a value added in a transaction cannot
  be used in that same transaction. The migration only adds values, so this is fine, but the seed
  must run afterwards rather than in the same connection.
- The e2e suite uploads fake bytes in several specs. Validation will break them, and they must be
  fixed to send real images rather than have the validation relaxed.
