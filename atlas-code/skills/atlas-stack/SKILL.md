---
name: atlas-stack
description: >
  How new code is written in the language and framework of this project: the defaults, the
  choices that matter and the mistakes typical of that stack. One short file per stack,
  picked from the project's own files: TypeScript and Node, React and Next, Vue and Nuxt,
  Angular, Python with Django and FastAPI, machine learning, Go, Rust, Java and Spring,
  Kotlin and Android, Swift, C#, PHP and Laravel, Ruby and Rails, Dart and Flutter, C++,
  databases, HTTP APIs. Use before writing or changing code in a project, once per stack per
  conversation, and when asked "what is the idiomatic way" — in any language.
---

What the project already does comes first. These files fill in what the project has not
decided; they never overrule a convention that is visible in its code.

## What to read

Everything below lives in the `stack/` folder beside this file. Read only the files this
project calls for, once; they are short.

By the project's files:
`package.json` with TypeScript or JavaScript → `typescript.md`; plus by dependency:
`react`, `next`, `react-native`, `expo`, `vite` → `react.md`; `vue`, `nuxt` → `vue.md`;
`@angular/core` → `angular.md`
`pyproject.toml`, `requirements.txt`, `manage.py` → `python.md`; plus `torch`,
`tensorflow`, `sklearn`, `xgboost` or training code → `ml.md`
`go.mod` → `go.md`
`Cargo.toml` → `rust.md`
`pom.xml`, `build.gradle` with Java sources → `java.md`
`build.gradle.kts` or Kotlin sources, Android, Compose → `kotlin.md`
`Package.swift`, `*.xcodeproj` → `swift.md`
`*.csproj`, `*.sln` → `csharp.md`
`composer.json` → `php.md`
`Gemfile` → `ruby.md`
`pubspec.yaml` → `dart.md`
`CMakeLists.txt`, `*.cpp`, `*.hpp` → `cpp.md`

By what the work touches, on top of the language:
a schema, a migration, a query, an ORM model, Redis → `database.md`
an HTTP endpoint, a service layer, error responses, a public contract → `api.md`

No file for the stack: say so in one line and write by the project's own code alone.

## Order of authority

1. The project's own code and its linter and formatter configuration. For an old codebase
   whose habits are not obvious: `atlas-refactor`, house style.
2. The file here.
3. Version-specific API: the documentation of the version installed (the manifest and the
   lock file say which), looked up, not remembered. These files name ideas, not signatures,
   because signatures change between major versions.

## With the other skills

These files say how to write. What is wrong in a diff is `atlas-review`'s file for the same
language; how to test is `atlas-test`'s; why the build fails is `atlas-fix`'s. They do not
repeat each other: when two disagree, the review file wins, because it is about a defect.

## Form

Nothing here changes how answers are written. The files are reference: they are read, not
quoted back.
