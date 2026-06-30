import Link from "next/link";

export default function Page() {
  return (
    <div className="app chooser">
      <div className="brand">
        <div className="brand-mark">For Izzie</div>
        <h1>Help!</h1>
        <div className="tagline">Pick the kind of help you need.</div>
      </div>

      <div className="chooser-grid">
        <Link href="/help" className="chooser-card">
          <div className="chooser-card-mark">Mode one</div>
          <h2>Help!</h2>
          <p className="chooser-card-sub">
            Drop in a worksheet, essay brief, or reading. Get back a sequenced study guide with
            timers, breaks, and a clear stopping point.
          </p>
          <div className="chooser-card-cta">Start a guide →</div>
        </Link>

        <Link href="/exam" className="chooser-card">
          <div className="chooser-card-mark">Mode two</div>
          <h2>Exam Practice</h2>
          <p className="chooser-card-sub">
            Upload a past paper, spec, and mark scheme. Sit it with a timer. Submit and get back a
            marked paper with coaching feedback.
          </p>
          <div className="chooser-card-cta">Start a paper →</div>
        </Link>

        <Link href="/filer" className="chooser-card">
          <div className="chooser-card-mark">Mode three</div>
          <h2>Where does this go?</h2>
          <p className="chooser-card-sub">
            Paste something a teacher gave you. Find out where it fits in Politics, what the key idea
            means, and one way to start thinking about it.
          </p>
          <div className="chooser-card-cta">Find its place →</div>
        </Link>
      </div>
    </div>
  );
}
