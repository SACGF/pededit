import { PRACTICE_FAMILIES } from "../data/practiceFamilies";
import { exampleBySlug } from "../data/examples";
import { GuideFigure } from "./GuideFigure";
import { AppLink, H2, P, References } from "./GuideLayout";

export function PracticeFamiliesGuide() {
  return (
    <>
      <P>
        Each family below is told as it might be in a clinic. Draw it, on paper or in{" "}
        <AppLink to="/">PedEdit</AppLink>, then open the answer to compare, and read the points a correct drawing shows.
        The families are invented. Every answer also opens in the editor, to change or to use as a starting point.
      </P>
      <P>
        New to drawing pedigrees? Start with <AppLink to="/guides/how-to-draw-a-pedigree">how to draw a pedigree</AppLink>{" "}
        and keep the <AppLink to="/guides/pedigree-symbols">symbols cheat sheet</AppLink> open beside you.
      </P>

      {PRACTICE_FAMILIES.map((f, n) => {
        const data = exampleBySlug(f.slug)!.data;
        return (
          <section key={f.slug} id={f.slug}>
            <H2>{n + 1}. {f.label}</H2>
            <p className="mb-3 text-sm text-gray-500">Practises: {f.teaches}</p>
            {f.history.map((para, i) => <P key={i}>{para}</P>)}
            <details className="mt-4 border rounded px-4 py-3">
              <summary className="cursor-pointer text-black font-medium">The answer</summary>
              <GuideFigure pedigree={data} alt={`The drawn pedigree for practice family ${n + 1}, ${f.label}`} />
              <p className="mb-2 font-medium text-black">Check that:</p>
              <ul className="list-disc pl-5 space-y-1 mb-3">
                {f.checks.map((c, i) => <li key={i}>{c}</li>)}
              </ul>
              <p className="text-sm">
                <AppLink to={`/example/${f.slug}`}>Open this answer in the editor</AppLink>. Nothing is saved until you
                change it.
              </p>
            </details>
          </section>
        );
      })}

      <H2>Using these for teaching</H2>
      <P>
        Each history can be read aloud while students draw, or handed out. Students can draw in PedEdit without an account and
        send the teacher the pedigree's link; anyone with the link can open and change it. The families can be changed into new exercises
        in the editor: open one, edit it, and the copy saved at its new link is yours.
      </P>

      <References />
    </>
  );
}
