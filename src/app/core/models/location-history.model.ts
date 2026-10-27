/** Single GPS position snapshot from the location_history collection */
export interface LocationHistory {
  id?: string;
  subassignmentId: string;
  lat: number;
  lng: number;
  accuracy?: number | null;
  recordedAt: string;   // ISO-8601 UTC string
  source?: string | null;
}
