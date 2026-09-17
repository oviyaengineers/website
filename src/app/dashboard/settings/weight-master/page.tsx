import type { Metadata } from "next";
import { WeightMasterManager } from "@/components/weight-master-manager";
import { getCurrentUserAndProfile } from "@/lib/auth";
import { fetchWeightMaster } from "@/lib/weight-data";

export const metadata: Metadata = { title: "Weight/Scrap Master | Oviya Engineers" };

/**
 * Rough and finished weight per piece for each Component + Material. Weight /
 * Scrap records copy these when a DC line is recorded; editing a master later
 * never changes a recorded line.
 */
export default async function WeightMasterPage() {
  const [{ items, components, materials }, { profile }] = await Promise.all([
    fetchWeightMaster(),
    getCurrentUserAndProfile(),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Weight/Scrap Master</h1>
        <p className="text-sm text-muted-foreground">
          Rough and finished weight per piece for each component and material. Scrap per piece is
          worked out automatically. A DC line uses the active master for its component and material
          when it is recorded, and keeps those weights even if the master changes later.
        </p>
      </div>
      <WeightMasterManager
        items={items}
        components={components}
        materials={materials}
        canEdit={profile?.role === "admin"}
      />
    </div>
  );
}
