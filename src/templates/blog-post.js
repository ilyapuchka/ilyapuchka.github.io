import * as React from "react"
import { Link, graphql } from "gatsby"

import Bio from "../components/bio"
import Layout from "../components/layout"
import Seo from "../components/seo"
import Disqus from "gatsby-plugin-disqus"

const BlogPostTemplate = ({
  data: { previous, next, site, markdownRemark: post },
  location,
}) => {
  //const siteTitle = site.siteMetadata?.title || `Title`
  const siteTitle = `All posts`
  const siteUrl = site.siteMetadata.siteUrl
  const postId = post.frontmatter.id || post.id
  const tags = post.frontmatter.tags ? post.frontmatter.tags + " | " : ""
  const disqusConfig = {
      url: `${siteUrl}${post.fields.slug}`,
      identifier: postId,
      title: post.title,
  }

  return (
    <Layout location={location} title={siteTitle}>
      <article
        className="blog-post"
        itemScope
        itemType="http://schema.org/Article"
      >
        <header>
          <h1 itemProp="headline">{post.frontmatter.title}</h1>
          <p>{tags}{post.frontmatter.date}</p>
        </header>
        <section
          dangerouslySetInnerHTML={{ __html: post.html }}
          itemProp="articleBody"
        />
        <hr />
        <footer>
          <Bio />
        </footer>
      </article>
      <section
        style={{
          display: `flex`,
          flexWrap: `wrap`,
          flexDirection: `row`,
          justifyContent: `space-between`,
          listStyle: `none`,
          padding: 0,
        }}
      >
        <section style={{maxWidth: `50%`, padding: 10}}>
        {previous && (
            <div>
              Previous:<br/>
              <Link style={{ boxShadow: `none`, color:'#000' }} to={previous.fields.slug} rel="prev">
                <strong>{previous.frontmatter.title}</strong>
              </Link>
              <p>{previous.frontmatter.date}</p>
              <p
                dangerouslySetInnerHTML={{
                  __html: previous.excerpt,
                }}
              />
            </div>
          )}
        </section>
        <section style={{maxWidth: `50%`, padding: 10}}>
          {next && (
            <div>
              Next:<br/>
              <Link style={{ boxShadow: `none`, color:'#000' }} to={next.fields.slug} rel="next">
                <strong>{next.frontmatter.title}</strong>
              </Link>
              <p>{next.frontmatter.date}</p>
              <p
                dangerouslySetInnerHTML={{
                  __html: next.excerpt,
                }}
              />
            </div>
        )}
        </section>
      </section>
      <Disqus config={disqusConfig} />
    </Layout>
  )
}

export const Head = ({ data: { markdownRemark: post } }) => {
  return (
    <Seo
      title={post.frontmatter.title}
      description={post.frontmatter.description || post.excerpt}
    />
  )
}

export default BlogPostTemplate

export const pageQuery = graphql`
  query BlogPostBySlug(
    $id: String!
    $previousPostId: String
    $nextPostId: String
  ) {
    site {
      siteMetadata {
        title
        siteUrl
      }
    }
    markdownRemark(id: { eq: $id }) {
      id
      excerpt(pruneLength: 160)
      html
      fields {
        slug
      }
      frontmatter {
        id
        title
        date(formatString: "MMMM DD, YYYY")
        description
        tags
      }
    }
    previous: markdownRemark(id: { eq: $previousPostId }) {
      excerpt(pruneLength: 160)
      fields {
        slug
      }
      frontmatter {
        title
        date(formatString: "MMMM DD, YYYY")
      }
    }
    next: markdownRemark(id: { eq: $nextPostId }) {
      excerpt(pruneLength: 160)
      fields {
        slug
      }
      frontmatter {
        title
        date(formatString: "MMMM DD, YYYY")
      }
    }
  }
`
