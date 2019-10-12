import React from "react"
import { Link, graphql } from "gatsby"

import Bio from "../components/bio"
import Layout from "../components/layout"
import SEO from "../components/seo"
import Disqus from "gatsby-plugin-disqus"
import { rhythm, scale } from "../utils/typography"

class BlogPostTemplate extends React.Component {
  render() {
    const post = this.props.data.markdownRemark
    //const siteTitle = this.props.data.site.siteMetadata.title
    const siteUrl = this.props.data.site.siteMetadata.siteUrl
    const postId = post.frontmatter.id || post.id
    const { previous, next } = this.props.pageContext
    const tags = post.frontmatter.tags ? post.frontmatter.tags + " |" : ""

    return (
      <Layout location={this.props.location} title="All posts">
        <SEO
          title={post.frontmatter.title}
          description={post.frontmatter.description || post.excerpt}
        />
        <h1>{post.frontmatter.title}</h1>
        <p
          style={{
            ...scale(-1 / 5),
            display: `block`,
            marginBottom: rhythm(1),
            marginTop: rhythm(-1),
          }}
        >
        </p>
        <p>
        <small style={{ color:'#565656' }}>{ tags } {post.frontmatter.date}</small>
        </p>
        <div dangerouslySetInnerHTML={{ __html: post.html }} />
        <hr
          style={{
            marginBottom: rhythm(1),
          }}
        />
        <Bio />
        <Disqus 
          identifier={postId}
          title={post.frontmatter.title}
          url={`${siteUrl}${post.fields.slug}`}
        />
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
                <p
                  dangerouslySetInnerHTML={{
                    __html: next.excerpt,
                  }}
                />
              </div>
          )}
          </section>
        </section>
      </Layout>
    )
  }
}

export default BlogPostTemplate

export const pageQuery = graphql`
  query BlogPostBySlug($slug: String!) {
    site {
      siteMetadata {
        title
        author
        siteUrl
      }
    }
    markdownRemark(fields: { slug: { eq: $slug } }) {
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
  }
`
