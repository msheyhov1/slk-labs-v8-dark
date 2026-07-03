import { Hero } from "@/components/sections/Hero";
import { Works } from "@/components/sections/Works";
import { Services } from "@/components/sections/Services";
import { Manifesto } from "@/components/sections/Manifesto";
import { Contact } from "@/components/sections/Contact";
import { StatusLine } from "@/components/status/StatusLine";

export default function Home() {
  // Contact (<footer>) — вне <main>: footer-потомок main теряет landmark contentinfo.
  return (
    <>
      <main id="content">
        <Hero />
        <Works />
        <Services />
        <Manifesto />
      </main>
      <Contact statusSlot={<StatusLine />} />
    </>
  );
}
