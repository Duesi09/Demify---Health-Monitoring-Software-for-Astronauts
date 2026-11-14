import { libraryListing } from "@/lib/assistant/library-source";

export const dynamic = "force-dynamic";

/**
 * GET /api/library -> LibraryListing: the documents of the onboard library
 * (database, or the files bundled with this release when there is none),
 * the medical-kit inventory, recent sync runs and how fresh the library is.
 */
export async function GET() {
  try {
    return Response.json(await libraryListing(), { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error(`[demify] Library listing failed: ${err instanceof Error ? err.message : String(err)}`);
    return Response.json({ error: "Could not read the onboard library" }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
