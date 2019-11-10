---
title: git rebase vs. git rebase --onto
date: 2019-11-10
description: "A quick note on git rebase vs. git rebase --onto"
---

Recently we were discussing in our team how to approach having fixes for bugs discovered during release both in release and the trunk branch to ensure we don't have to deal with large merges and possible conflicts in the release branch when we are done with a release and immediately benefit from those fixes on the trunk while we keep working on it. We figured there are two pretty-much similar options: either we cherry-pick commits from trunk to release branch or we cherry-pick from release branch to trunk. As our trunk and release branches are configured as protected on GitHub, we can't just cherry-pick fixes and push them to the target branch. We would need to create a new branch based on the head of the target branch (or reset branch with a fix to reuse it), cherry-pick required commits to it and only then push and create a PR. This works but cherry-picking more than a few commits one by one (or even using range of commits) seems like an extra and error-prone work. Instead we could rebase. That's when I've learned about `git rebase --onto` from [Michael Brown](https://twitter.com/mluisbrown). Let's see how it is different from more commonly used `git rebase`.

Let's say we have a following git tree:

```
$ git log --graph --oneline --all --pretty=format:'%s%d'
*   Merge branch 'fix' into release (release)
|\  
| * E (HEAD -> fix)
|/  
* D
* C
| * F (master)
|/  
* B
* A
```

Here we have a `master` branch where we continue development while we are at the same time working on a release and we have a `fix` branch with a fix (commit `E`) that we already merged into `release` branch.

Now we want to bring this fix from commit `E` from `release` to `master`. If we try `git rebase master` from `fix` branch we will have the following result:

```
$ git rebase master
First, rewinding head to replay your work on top of it...
Applying: C
Applying: D
Applying: E
$ git log --graph --oneline --all --pretty=format:'%s%d'
* E (HEAD -> fix)
* D
* C
* F (master)
| *   Merge branch 'fix' into release (release)
| |\  
| | * E
| |/  
| * D
| * C
|/  
* B
* A
```

As we see `rebase` took all the commits in the `fix` branch that are not present in `master` and replayed them on `master` though we only wanted to have a single commit `E`.

Now when we instead do `git rebase --onto master HEAD~` we get what we want:

```
$ git rebase --onto master HEAD~
First, rewinding head to replay your work on top of it...
Applying: E
$ git log --graph --oneline --all --pretty=format:'%s%d'
* E (HEAD -> fix)
* F (master)
| *   Merge branch 'fix' into release (release)
| |\  
| | * E
| |/  
| * D
| * C
|/  
* B
* A
```

We can see that the difference between `git rebase` and `git rebase --onto` is that the former _changes the base of a whole branch_, meaning that it will find at what point current branch diverged from the target branch and will replay all the commits from this point on the new target branch, when the later _changes the base of a commit_ by replacing its old base with a new base. In our case, as we want just a single commit from the `fix` branch we need to change the base of this commit, which is `HEAD~` with a new base, which is `master`.

Another option would be to use interactive rebase and manually remove commits that we don't need, but similarly to cherry-picking this can be a lot of error-prone work if our `release` branch contains a lot of other commits.

That's it. Next time you `rebase`, remember that `rebase --onto` can be a better option. And if you want to learn about a few more complicated use cases read [this](https://content.pivotal.io/blog/git-rebase-onto) article.
