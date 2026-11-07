# Rotor

**A notebook you can turn in your hands.**

Rotor is a note-taking tool built on one simple idea. Your notes have more than one shape, so you should be able to look at them from more than one side.

It comes as a single file you open in your web browser. You don't install anything, create an account or need an internet connection. You write your notes once. Then you *rotate* them to see the same notes arranged by topic, by project, by status, by week, or by any combination. You can keep writing and rearranging in whichever arrangement you happen to be looking at.

> *Rotor is a working title for an evolving project. This page describes the design as a whole. Some parts described here, especially the optional AI helpers, are planned rather than finished.*

---

## The problem with where notes live

Think about any single note you've taken. "Ask Dana about the budget before Friday" is about money. It belongs to a project and involves a person. It has a deadline, and it's either done or not done.

That one thought has at least five "addresses." Almost every note-taking tool makes you pick one:

- **Folders** make you choose the one folder it goes in.
- **Outlines and pages** make you choose the one page it lives on.
- **Linked-note tools** make it a dot in a web of links.
- **Database-style tools** make it a row in a table whose columns were decided in advance.

Everything else gets demoted to tags and filters. Tags and filters help you *find* a note again. They don't let you *see your whole collection differently*. You can search for everything tagged "budget." You can't easily stand back and look at all your notes laid out as *projects down the side, people across the top*. Then, a moment later, you can't swap that for *weeks down the side, status across the top* without building a separate report that goes stale.

## The idea: notes as a cube

Rotor treats your notebook as a **cube** rather than a stack of pages.

- Each **note** is a piece of writing: a thought, a task, a quote, a fragment.
- Each **dimension** is a way of sorting notes. *Topic*, *Project*, *Status*, *Person* and *Week* are all dimensions.
- Each dimension has **values**. The *Status* dimension might have the values *Open*, *In progress* and *Done*.
- Every note has a position along each dimension. A note can sit in more than one place on a dimension, because a note can be about two topics at once. It can also sit nowhere on a dimension, because not everything needs a status.

You then choose which dimensions to lay out as **rows** and which as **columns**. You can also choose some to use as **filters** that narrow what you see. The result looks like a grid. Each square holds the notes that sit at that crossing, such as all the *AI* notes that are *Open*.

That arrangement is called a **view**, and changing it is called **rotation**. Drag *Status* from the columns onto the rows and drag *Project* into the columns, and your notes rearrange themselves. They are the same notes, seen from a different side.

The principle at the heart of Rotor is:

> **The cube is the truth; every view is a projection, and every projection is writable.**

Put plainly, there's only one copy of your notes. Views are just ways of standing in front of them. You can edit directly from any view, and your changes are meaningful in every other view.

## What it looks like

The screen is mostly a grid, with a few controls around the edges: