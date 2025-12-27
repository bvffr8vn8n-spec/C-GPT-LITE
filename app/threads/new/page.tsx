import NewThreadForm from "../NewThreadForm";

export default function NewThreadPage() {
  return (
    <main style={{ maxWidth: 720, margin: "40px auto", padding: 16 }}>
      <h1 style={{ fontSize: 28, marginBottom: 12 }}>Создать новый тред</h1>
      <section style={{ marginBottom: 20 }}>
        <NewThreadForm />
      </section>
    </main>
  );
}

