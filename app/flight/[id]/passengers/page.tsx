import { Suspense } from "react";
import { PassengersScreen } from "@/components/passengers-screen";

export default function PassengersPage() {
  return (
    <Suspense>
      <PassengersScreen />
    </Suspense>
  );
}
