import React from "react"
import { Link, graphql } from "gatsby"

import Bio from "../components/bio"
import Layout from "../components/layout"
import SEO from "../components/seo"
import { rhythm } from "../utils/typography"

class BlogIndex extends React.Component {
  render() {
    const { data } = this.props
    const siteTitle = data.site.siteMetadata.title
    const posts = data.allMarkdownRemark.edges

    return (
      <Layout location={this.props.location} title={siteTitle}>
        <SEO title="All posts" />
        {posts.map(({ node }) => {
          if (node.fields.slug === `/dummy/`) { return null }

          const title = node.frontmatter.title || node.fields.slug
          const tags = node.frontmatter.tags ? node.frontmatter.tags + " |" : ""
          return (
            <div key={node.fields.slug}>
              <h3
                style={{
                  marginBottom: rhythm(1 / 4),
                }}
              >
                <Link style={{ boxShadow: `none`, color:'#000' }} to={node.fields.slug}>
                  {title}
                </Link>
              </h3>
              <p>
              <small style={{ color:'#565656' }}>{ tags } {node.frontmatter.date}</small>
              </p>
              <p
                dangerouslySetInnerHTML={{
                  __html: node.frontmatter.description || node.html.split("<!-- description -->")[0] || node.excerpt,
                }}
              />
            </div>
          )
        })}
        <hr
          style={{
            marginBottom: rhythm(1),
          }}
        />
        <Bio />
      </Layout>
    )
  }
}

export default BlogIndex

export const pageQuery = graphql`
  query {
    site {
      siteMetadata {
        title
      }
    }
    allMarkdownRemark(sort: { fields: [frontmatter___date], order: DESC }) {
      edges {
        node {
          excerpt(format: HTML)
          html
          fields {
            slug
          }
          frontmatter {
            date(formatString: "MMMM DD, YYYY")
            title
            description
            tags
          }
        }
      }
    }
  }
`
