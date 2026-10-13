from app.core.config import Settings


def main():
    from app.db.session import initialize_database, make_engine
    settings = Settings.from_env()
    engine = make_engine(settings.database_url)
    initialize_database(engine)
    engine.dispose()
    print("Database siap. Data yang ada tidak dihapus.")


if __name__ == "__main__":
    main()
