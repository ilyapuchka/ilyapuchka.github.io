import * as React from "react"
import { Link } from "gatsby"

const Layout = ({ location, title, children }) => {
  const rootPath = `${__PATH_PREFIX__}/`
  const isRootPath = location.pathname === rootPath
  const header = (
      <h1 className="main-heading">
        <Link to="/">{title}</Link>
      </h1>
    )

  return (
    <div className="global-wrapper" data-is-root-path={isRootPath}>
      <header className="global-header">{header}</header>
      <main>{children}</main>
      <footer>
        <a style={{ boxShadow: `none` }} rel={"license"} href={"http://creativecommons.org/licenses/by/4.0/"}><img alt={"Creative Commons Licence"} src={"https://i.creativecommons.org/l/by/4.0/88x31.png"} /></a>
        <br/>
        <p>
          This work is licensed under a <a rel={"license"} href={"http://creativecommons.org/licenses/by/4.0/"}>Creative Commons Attribution 4.0 International License</a>.
        </p>
        © {new Date().getFullYear()}, Built with
        {` `}
        <a href="https://www.gatsbyjs.com">Gatsby</a>
      </footer>
    </div>
  )
}

export default Layout
